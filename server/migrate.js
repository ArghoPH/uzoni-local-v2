#!/usr/bin/env node
/**
 * Creates the database if it is missing, then applies every file in db/ in
 * order. Safe to run again: the SQL is written to be idempotent.
 */
import 'dotenv/config'
import pg from 'pg'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const dbDir = join(here, '..', 'db')

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env first.')
  process.exit(1)
}

const parsed = new URL(url)
const dbName = decodeURIComponent(parsed.pathname.slice(1))
if (!dbName) {
  console.error(`DATABASE_URL has no database name: ${url}`)
  process.exit(1)
}

// Connect to the maintenance database first so the target can be created.
const adminUrl = new URL(url)
adminUrl.pathname = '/postgres'

/** Turns a driver-level failure into something that names the actual problem. */
function explain(err) {
  const host = parsed.hostname || 'localhost'
  const port = parsed.port || '5432'
  const code = err.code ?? err.errors?.[0]?.code

  if (code === 'ECONNREFUSED') {
    return [
      `Nothing is listening on ${host}:${port}, so PostgreSQL is not running.`,
      '',
      '  Windows   Get-Service *postgres*        (then Start-Service <name>)',
      '  macOS     brew services start postgresql@16',
      '  Linux     sudo systemctl start postgresql',
      '',
      'If there is no service at all, PostgreSQL is not installed yet:',
      '  https://www.postgresql.org/download/',
    ].join('\n')
  }
  if (code === '28P01' || code === '28000') {
    return `PostgreSQL refused the username or password in DATABASE_URL.\nUse the password you set when installing it, and check the user name (usually "postgres").`
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return `The host "${host}" in DATABASE_URL does not resolve. For a database on this machine, use localhost.`
  }
  if (code === 'ETIMEDOUT') {
    return `Connecting to ${host}:${port} timed out. A firewall may be in the way, or the host is wrong.`
  }
  return err.message
}

const admin = new pg.Client({ connectionString: adminUrl.toString() })
try {
  await admin.connect()
} catch (err) {
  console.error(`\nCannot connect to PostgreSQL.\n\n${explain(err)}\n`)
  console.error(`DATABASE_URL currently points at: ${host_display()}\n`)
  process.exit(1)
}

function host_display() {
  const shown = new URL(url)
  if (shown.password) shown.password = '***'
  return shown.toString()
}
const exists = await admin.query('select 1 from pg_database where datname = $1', [dbName])
if (exists.rowCount === 0) {
  // The name cannot be parameterised in CREATE DATABASE, so it is quoted.
  await admin.query(`create database "${dbName.replace(/"/g, '""')}"`)
  console.log(`created database ${dbName}`)
} else {
  console.log(`database ${dbName} already exists`)
}
await admin.end()

const client = new pg.Client({ connectionString: url })
try {
  await client.connect()
} catch (err) {
  console.error(`\nCannot open the ${dbName} database.\n\n${explain(err)}\n`)
  process.exit(1)
}

const files = (await readdir(dbDir)).filter((f) => f.endsWith('.sql')).sort()
for (const file of files) {
  const sql = await readFile(join(dbDir, file), 'utf8')
  process.stdout.write(`applying ${file} ... `)
  try {
    await client.query(sql)
    console.log('ok')
  } catch (err) {
    console.log('failed')
    console.error(`\n${file}: ${err.message}`)
    await client.end()
    process.exit(1)
  }
}

const { rows } = await client.query(
  'select (select count(*) from currencies) as currencies, (select count(*) from categories) as categories',
)
console.log(`\nReady — ${rows[0].currencies} currencies, ${rows[0].categories} categories.`)
await client.end()
