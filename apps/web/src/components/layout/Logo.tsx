export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden>
        N
      </span>
      {!compact && <span className="brand-name">NEXORA</span>}
      {compact && <span className="sr-only">Nexora</span>}
    </div>
  );
}
