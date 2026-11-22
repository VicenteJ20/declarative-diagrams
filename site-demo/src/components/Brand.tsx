const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

/**
 * The product mark: a parent node branching into two child nodes with an orthogonal
 * connector. It stays legible at 16 px, where the three nodes read as a small tree.
 */
export function LogoMark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="10.75" y="3.25" width="10.5" height="10.5" rx="3.25" fill="currentColor" />
      <rect x="3.25" y="18.25" width="10.5" height="10.5" rx="3.25" stroke="currentColor" strokeWidth="2" />
      <rect x="18.25" y="18.25" width="10.5" height="10.5" rx="3.25" stroke="currentColor" strokeWidth="2" />
      <path
        d="M16 13.75V18.25M16 18.25H8.5M16 18.25H23.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function Brand({ href = `${BASE}/`, compact = false }: { href?: string; compact?: boolean }) {
  return (
    <a className="brand" href={href} aria-label="Declarative Diagrams">
      <span className="mark">
        <LogoMark size={compact ? 22 : 26} />
      </span>
      <span className="word">
        <b>declarative</b>
        <span>diagrams</span>
      </span>
    </a>
  );
}
