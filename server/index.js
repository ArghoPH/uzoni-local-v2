import 'dotenv/config'
import express from 'express'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { api } from './routes.js'
import { pool } from './db.js'

const here = dirname(fileURLToPath(import.meta.url))
const distDir = join(here, '..', 'dist')
const port = Number(process.env.PORT) || 5174

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.')
  process.exit(1)
}

const app = express()
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', async (_req, res) => {
  try {
    const { rows } = await pool.query("select to_regclass('public.settings') as t")
    res.json({ ok: Boolean(rows[0].t), database: 'up', schema: rows[0].t ? 'ready' : 'missing' })
  } catch (err) {
    res.status(503).json({ ok: false, database: 'down', message: err.message })
  }
})

app.use('/api', api)

// In production the same server hands out the built frontend, so there is one
// process, one port, and no CORS anywhere.
if (existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(join(distDir, 'index.html')))
}

app.use((_req, res) => res.status(404).json({ error: { message: 'Not found' } }))

// Postgres raises a specific error for every rule the schema enforces. They are
// passed through with their code so the frontend can phrase them for a person.
app.use((err, _req, res, _next) => {
  const code = err.code

  // A missing table, function or type means the schema was never applied or is
  // out of date — a setup problem, not a bad request, so say so plainly.
  if (code === '42P01' || code === '42883' || code === '42704' || code === '3D000') {
    console.error(`Schema problem: ${err.message}`)
    return res.status(503).json({
      error: {
        code,
        message: 'The database schema is missing or out of date. Stop the server and run: npm run db:setup',
      },
    })
  }

  const status =
    code === '23505' ? 409 :
    code === '23503' ? 409 :
    code === '23514' ? 400 :
    code === 'P0001' ? 400 :
    code === '22P02' ? 400 :
    code === '28P01' ? 503 :
    code === 'ECONNREFUSED' ? 503 :
    500

  if (status === 500) console.error(err)
  else console.error(`${code ?? 'error'}: ${err.message}`)

  res.status(status).json({
    error: {
      message: err.message || 'The server hit an unexpected problem. Check the terminal running the API.',
      code,
      detail: err.detail,
    },
  })
})

// Fail loudly at boot rather than on the first request a person makes.
try {
  await pool.query('select 1')
  const { rows } = await pool.query("select to_regclass('public.settings') as t")
  if (!rows[0].t) {
    console.error('\nConnected to PostgreSQL, but the Uzoni tables are not there.')
    console.error('Run this first:\n\n  npm run db:setup\n')
    process.exit(1)
  }
} catch (err) {
  console.error('\nCannot connect to PostgreSQL.')
  if (err.code === 'ECONNREFUSED' || err.errors?.[0]?.code === 'ECONNREFUSED') {
    console.error('Nothing is listening on that port, so PostgreSQL is not running.')
    console.error('  Windows   Get-Service *postgres*   (then Start-Service <name>)')
    console.error('  macOS     brew services start postgresql@16')
    console.error('  Linux     sudo systemctl start postgresql')
  } else if (err.code === '3D000') {
    console.error('The database does not exist yet. Run:  npm run db:setup')
  } else if (err.code === '28P01') {
    console.error('The password in DATABASE_URL was rejected.')
  } else {
    console.error(err.message)
  }
  console.error('')
  process.exit(1)
}

const server = app.listen(port, '127.0.0.1', () => {
  console.log(`Uzoni API listening on http://127.0.0.1:${port}`)
  if (existsSync(distDir)) console.log(`Serving the app from ${distDir}`)
})

// Node closes an idle keep-alive socket after 5 seconds by default, which a
// proxy in front of it can hit mid-request and report as ECONNRESET. Holding
// sockets open longer than anything in front removes that race.
server.keepAliveTimeout = 65_000
server.headersTimeout = 66_000

server.on('clientError', (err, socket) => {
  if (!socket.writable) return
  socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
  console.error(`client error: ${err.message}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => pool.end().then(() => process.exit(0)))
  })
}
