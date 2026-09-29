import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'uzoni-'))
const out = join(dir, 'csv.mjs')
await build({ entryPoints: ['src/lib/csv.ts'], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' })
const C = await import(pathToFileURL(out).href)

let failed = 0
const eq = (a, e, what) => {
  const ok = JSON.stringify(a) === JSON.stringify(e)
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok ? '' : ` -> got ${JSON.stringify(a)}, expected ${JSON.stringify(e)}`}`)
}

// --- parseCsv --------------------------------------------------------------
eq(C.parseCsv('a,b\n1,2'), { headers: ['a', 'b'], rows: [['1', '2']] }, 'simple csv')
eq(C.parseCsv('a,b\r\n1,2\r\n'), { headers: ['a', 'b'], rows: [['1', '2']] }, 'CRLF line endings')
eq(C.parseCsv('﻿a,b\n1,2'), { headers: ['a', 'b'], rows: [['1', '2']] }, 'strips the BOM')
eq(C.parseCsv('a,b\n"x,y",2'), { headers: ['a', 'b'], rows: [['x,y', '2']] }, 'quoted comma')
eq(C.parseCsv('a,b\n"he said ""hi""",2'), { headers: ['a', 'b'], rows: [['he said "hi"', '2']] }, 'escaped quotes')
eq(C.parseCsv('a,b\n"line\nbreak",2'), { headers: ['a', 'b'], rows: [['line\nbreak', '2']] }, 'newline inside a quoted field')
eq(C.parseCsv('a,b\n1,2\n\n3,4'), { headers: ['a', 'b'], rows: [['1', '2'], ['3', '4']] }, 'blank line skipped')

// --- toCsv round trip ------------------------------------------------------
const csv = C.toCsv(['Name', 'Note'], [['Shwapno', 'bought rice, dal'], ['Café', 'said "hi"']])
eq(C.parseCsv(csv), {
  headers: ['Name', 'Note'],
  rows: [['Shwapno', 'bought rice, dal'], ['Café', 'said "hi"']],
}, 'write then read gives back the same rows')

console.log(failed === 0 ? '\n===== csv.ts: all checks passed =====' : `\n===== ${failed} FAILED =====`)
process.exit(failed === 0 ? 0 : 1)
