import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig(({ mode }) => {
  // vite.config runs in Node, where .env is not loaded automatically. Read it
  // here so the proxy always points at the same port the API server binds to.
  const env = loadEnv(mode, process.cwd(), '')
  const apiPort = env.PORT || '5174'
  const target = `http://127.0.0.1:${apiPort}`

  return {
    plugins: [react()],
    resolve: { alias: { '@': path.resolve(__dirname, './src') } },
    server: {
      port: 5173,
      // Without this Vite walks to the next free port when 5173 is taken, and
      // the next port is often the database's. Fail loudly instead.
      strictPort: true,
      proxy: {
        // Everything under /api goes to the local API server, so the browser
        // only ever talks to one origin and there is no CORS to configure.
        '/api': {
          target,
          changeOrigin: false,
          ws: false,
          configure: (proxy) => {
            // On Windows a pooled keep-alive socket to loopback can be reset
            // between requests, which surfaces as "read ECONNRESET" before the
            // response is read. One connection per request costs nothing here
            // and removes the failure entirely.
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('Connection', 'close')
            })
            proxy.on('error', (err, _req, res) => {
              const message = `Cannot reach the Uzoni API at ${target} — ${err.message}`
              console.error(`[proxy] ${message}`)
              // `res` is a ServerResponse for a normal request and a raw
              // Socket for an upgrade, so answer only when it can reply.
              const response = res as Partial<{
                writableEnded: boolean
                writeHead: (code: number, headers: Record<string, string>) => void
                end: (body: string) => void
              }>
              if (typeof response.writeHead === 'function'
                && typeof response.end === 'function'
                && !response.writableEnded) {
                response.writeHead(503, { 'Content-Type': 'application/json' })
                response.end(JSON.stringify({ error: { message, code: 'PROXY' } }))
              }
            })
          },
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            charts: ['recharts'],
            data: ['@tanstack/react-query'],
          },
        },
      },
    },
  }
})
