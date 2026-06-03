import { useRef } from 'react'

// Editable color row: swatch + label + hex (click swatch opens native picker).
export function ColorRow({ label, value, onChange }) {
  const ref = useRef(null)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
      <button
        onClick={() => ref.current && ref.current.click()}
        style={{ width: 30, height: 22, borderRadius: 3, border: '2px solid var(--line)', background: value, cursor: 'pointer', position: 'relative', flexShrink: 0, boxShadow: 'inset 0 0 0 1px #00000030' }}
      >
        <input
          ref={ref} type="color" value={value} onChange={(e) => onChange(e.target.value)}
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
        />
      </button>
      <span style={{ fontSize: 12.5, color: 'var(--ink-dim)', flex: 1, fontFamily: 'var(--ui)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-faint)' }}>{String(value).toUpperCase()}</span>
    </div>
  )
}
