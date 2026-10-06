// Eigenes PKMessenger-Logo (bewusst kein Discord-Branding).
export default function Logo({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="pkg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2dd4bf" />
          <stop offset="1" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="14" fill="url(#pkg)" />
      <path d="M14 34V14h8.5a6 6 0 0 1 0 12H18" fill="none" stroke="#0b0e14" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M27 14v20M27 25l8-11M29.5 22.5 36 34" fill="none" stroke="#0b0e14" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
