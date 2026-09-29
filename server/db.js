import pg from 'pg'

// Postgres returns bigint as a string by default because a 64-bit integer does
// not always fit in a JS number. Every bigint here is minor units of money, so
// it is far inside Number.MAX_SAFE_INTEGER — parsing them keeps the API shape
// identical to what the frontend already expects.
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)))
// numeric (exchange rates) likewise.
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)))
// date: hand back the plain YYYY-MM-DD rather than a timezone-shifted Date.
pg.types.setTypeParser(1082, (v) => v)

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
})

export async function query(text, params) {
  const result = await pool.query(text, params)
  return result.rows
}

export async function one(text, params) {
  const rows = await query(text, params)
  return rows[0] ?? null
}

/** Runs a set of statements in a transaction, rolling back on any error. */
export async function tx(fn) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (err) {
    await client.query('rollback')
    throw err
  } finally {
    client.release()
  }
}

/**
 * Builds `set a = $1, b = $2` from an object, skipping undefined so a PATCH
 * only touches the fields it was given. Column names come from an allow-list,
 * never from the request body, so a client cannot reach a column it shouldn't.
 */
export function buildUpdate(body, allowed, startIndex = 1) {
  const sets = []
  const values = []
  let i = startIndex
  for (const key of allowed) {
    if (body[key] !== undefined) {
      sets.push(`${key} = $${i++}`)
      values.push(body[key])
    }
  }
  return { clause: sets.join(', '), values, next: i }
}

export function buildInsert(body, allowed) {
  const cols = []
  const params = []
  const values = []
  let i = 1
  for (const key of allowed) {
    if (body[key] !== undefined) {
      cols.push(key)
      params.push(`$${i++}`)
      values.push(body[key])
    }
  }
  return { cols: cols.join(', '), params: params.join(', '), values }
}
