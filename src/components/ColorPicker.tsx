import { useEffect, useState } from 'react'

const HEX = /^#[0-9A-Fa-f]{6}$/

export const DEFAULT_SWATCHES = [
  '#3b45d6', '#0f7b4f', '#be3b3b', '#b45309',
  '#7c3aed', '#0891b2', '#db2777', '#4b5563',
]

/**
 * Quick swatches, the OS colour picker, and a hex field — all writing the same
 * `#rrggbb` string. The database has a CHECK constraint for exactly that shape,
 * so a half-typed hex is held locally until it is valid.
 */
export function ColorPicker({
  value, onChange, swatches = DEFAULT_SWATCHES,
}: {
  value: string
  onChange: (hex: string) => void
  swatches?: string[]
}) {
  const [text, setText] = useState(value)

  useEffect(() => { setText(value) }, [value])

  const commit = (raw: string) => {
    const hex = raw.startsWith('#') ? raw : `#${raw}`
    if (HEX.test(hex)) onChange(hex.toLowerCase())
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {swatches.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className="h-7 w-7 rounded-full"
          style={{
            background: c,
            outline: value.toLowerCase() === c.toLowerCase() ? '2px solid var(--ink)' : 'none',
            outlineOffset: 2,
          }}
          aria-label={`Colour ${c}`}
        />
      ))}

      {/* The native picker, with the current colour showing through the ring. */}
      <label
        className="relative grid h-7 w-7 cursor-pointer place-items-center rounded-full"
        style={{
          background:
            'conic-gradient(#ef4444,#f59e0b,#84cc16,#10b981,#06b6d4,#3b82f6,#8b5cf6,#ec4899,#ef4444)',
        }}
        title="Pick any colour"
      >
        <input
          type="color"
          value={HEX.test(value) ? value : '#3b45d6'}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label="Pick any colour"
        />
        <span
          className="pointer-events-none h-3.5 w-3.5 rounded-full"
          style={{ background: value, boxShadow: '0 0 0 1.5px var(--surface)' }}
        />
      </label>

      <input
        value={text}
        onChange={(e) => { setText(e.target.value); commit(e.target.value) }}
        onBlur={() => setText(value)}
        spellCheck={false}
        className="field fig w-28 !py-1.5 text-sm uppercase"
        aria-label="Hex colour"
        placeholder="#3B45D6"
      />
    </div>
  )
}
