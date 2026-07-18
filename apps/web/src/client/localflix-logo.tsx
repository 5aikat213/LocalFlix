export interface LocalFlixLogoProps {
  variant?: "full" | "compact" | "intro";
  animated?: boolean;
  decorative?: boolean;
  className?: string;
}

export function LocalFlixLogo({
  variant = "full",
  animated = false,
  decorative = false,
  className = ""
}: LocalFlixLogoProps) {
  const classes = [
    "localflix-logo",
    `localflix-logo-${variant}`,
    animated ? "is-animated" : "",
    className
  ].filter(Boolean).join(" ");
  return (
    <span
      className={classes}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "LocalFlix"}
      aria-hidden={decorative || undefined}
    >
      <span className="localflix-mark">
        <i className="localflix-mark-left" />
        <i className="localflix-mark-slash" />
        <i className="localflix-mark-right" />
      </span>
      <span className="localflix-type">
        <b>LOCAL</b><strong>FLIX</strong>
      </span>
    </span>
  );
}
