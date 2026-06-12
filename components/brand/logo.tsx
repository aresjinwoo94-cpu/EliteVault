import { cn } from "@/lib/utils";

export function Logo({
  className,
  wordmark = true,
  size = 24,
}: {
  className?: string;
  wordmark?: boolean;
  size?: number;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        aria-hidden
        className="shrink-0"
      >
        <defs>
          <linearGradient id="ev-gold" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#FFF8E1" />
            <stop offset="0.5" stopColor="#D4AF37" />
            <stop offset="1" stopColor="#8A6A1A" />
          </linearGradient>
          <linearGradient id="ev-signal" x1="0" x2="1" y1="1" y2="0">
            <stop offset="0" stopColor="#5EEAD4" />
            <stop offset="1" stopColor="#14B8A6" />
          </linearGradient>
        </defs>
        {/* outer diamond */}
        <path
          d="M16 2 L30 16 L16 30 L2 16 Z"
          stroke="url(#ev-gold)"
          strokeWidth="1.4"
          fill="rgba(212,175,55,0.04)"
        />
        {/* inner vault keyhole — teal signal */}
        <circle cx="16" cy="14" r="3" fill="url(#ev-signal)" />
        <rect x="14.5" y="14" width="3" height="6" fill="url(#ev-signal)" />
      </svg>
      {wordmark && (
        <span className="font-serif text-[19px] tracking-tight text-white">
          EliteVault
        </span>
      )}
    </div>
  );
}
