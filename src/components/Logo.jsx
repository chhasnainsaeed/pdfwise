export default function Logo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--brand)" />
      <path
        d="M11.5 6.5H18l5.5 5.5v12.5a1.5 1.5 0 0 1-1.5 1.5H11.5A1.5 1.5 0 0 1 10 24.5V8a1.5 1.5 0 0 1 1.5-1.5z"
        fill="#fff"
      />
      <path d="M18 6.5V12h5.5z" fill="#c8c2ff" />
      <path d="M13.5 17h6M13.5 20.5h4" stroke="var(--brand)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
