import { Check } from 'lucide-react'

export function Field({ label, hint, error, children }) {
  return (
    <div className="field">
      {label && <span className="field-label">{label}</span>}
      {children}
      {error ? (
        <small className="field-error">{error}</small>
      ) : hint ? (
        <small className="field-hint">{hint}</small>
      ) : null}
    </div>
  )
}

export function Segmented({ value, onChange, options, label }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'is-active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function RadioCards({ value, onChange, options, label }) {
  return (
    <div className="radio-cards" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={`radio-card ${value === o.value ? 'is-active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          <span className="radio-dot">{value === o.value && <Check size={12} strokeWidth={3} />}</span>
          <span>
            <strong>{o.label}</strong>
            {o.text && <small>{o.text}</small>}
          </span>
        </button>
      ))}
    </div>
  )
}

export function Checkbox({ checked, onChange, children }) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="checkbox-box">{checked && <Check size={13} strokeWidth={3} />}</span>
      <span>{children}</span>
    </label>
  )
}

export function NumberInput({ value, onChange, min, max, step = 1, suffix, ...rest }) {
  return (
    <div className="num-input">
      <input
        type="number"
        inputMode="decimal"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        {...rest}
      />
      {suffix && <span className="num-suffix">{suffix}</span>}
    </div>
  )
}

/** Clamps a possibly-empty number input value. */
export const clampNum = (v, min, max, fallback = min) =>
  v === '' || Number.isNaN(Number(v)) ? fallback : Math.min(max, Math.max(min, Number(v)))

export function Summary({ rows }) {
  return (
    <dl className="summary">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}
