import Link from "next/link";

type Props = {
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
  href?: string;
  className?: string;
};

const heights = {
  sm: 32,
  md: 44,
  lg: 72,
};

export default function ClipSaasLogo({
  size = "md",
  showTagline = false,
  href,
  className = "",
}: Props) {
  const height = heights[size];
  const inner = (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <div
        aria-label="ClipSaaS"
        className="flex items-center font-extrabold tracking-tight text-zinc-100"
        style={{ fontSize: Math.round(height * 0.62), lineHeight: `${height}px` }}
      >
        <span className="mr-2 text-green-500">▶</span>
        ClipSaaS
      </div>
      {showTagline && (
        <span className="text-xs uppercase tracking-widest text-muted">
          Gerador de Legendas
        </span>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-block transition opacity-90 hover:opacity-100">
        {inner}
      </Link>
    );
  }

  return inner;
}
