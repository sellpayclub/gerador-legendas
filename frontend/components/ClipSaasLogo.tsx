import Image from "next/image";
import Link from "next/link";
import { CLIPSAAS_LOGO_URL } from "@/lib/brand";

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
      <Image
        src={CLIPSAAS_LOGO_URL}
        alt="ClipSaaS"
        width={Math.round(height * 3.5)}
        height={height}
        className="h-auto w-auto object-contain"
        style={{ maxHeight: height }}
        priority={size === "lg"}
      />
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
