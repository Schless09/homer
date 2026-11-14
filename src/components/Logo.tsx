export function Logo({ withText = true }: { withText?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="#1f1e1c" />
        <path d="M6 18V10.5L12 6l6 4.5V18" fill="none" stroke="#faf8f4" strokeWidth="1.8" strokeLinejoin="round" />
        <rect x="10" y="13" width="4" height="5" rx="0.6" fill="#b4654a" />
      </svg>
      {withText && <span className="font-display text-[21px] leading-none tracking-tight">Homer</span>}
    </span>
  );
}
