import {
  Children,
  cloneElement,
  isValidElement,
  type ButtonHTMLAttributes,
  type ReactElement,
} from "react";

import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

/* Small radius, medium weight, no shadow, no gloss. A button here is a solid
   rectangle of ink with a label on it — the crispness is the character. The
   only motion is a 1px press, which is transform-only so it never reflows. */
const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium " +
  "transition-[background-color,border-color,color] duration-150 " +
  "active:translate-y-px " +
  "focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-ink-900/25 focus-visible:ring-offset-2 " +
  "disabled:pointer-events-none disabled:opacity-40";

const variants: Record<Variant, string> = {
  // Dark fills lift on hover rather than deepening — there is nothing darker
  // than near-black to go to.
  primary: "bg-ink-900 text-[#fefefe] hover:bg-brand-700",
  secondary:
    "bg-surface text-ink-800 border border-border hover:border-ink-900 hover:text-ink-900",
  ghost: "bg-transparent text-ink-600 hover:bg-ink-100 hover:text-ink-900",
  danger: "bg-red-700 text-[#fefefe] hover:bg-red-800",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-4 text-sm",
  lg: "h-10.5 px-5 text-[15px]",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
  /**
   * Render styles onto the single child element (e.g. a <Link>) instead of a
   * <button>. Useful for navigation CTAs styled as buttons.
   */
  asChild?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  loading = false,
  asChild = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const classes = cn(
    base,
    variants[variant],
    sizes[size],
    fullWidth && "w-full",
    className,
  );

  if (asChild && isValidElement(children)) {
    const child = Children.only(children) as ReactElement<{
      className?: string;
    }>;
    return cloneElement(child, {
      className: cn(classes, child.props.className),
    });
  }

  return (
    <button className={classes} disabled={disabled || loading} {...props}>
      {loading && (
        <span
          aria-hidden
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}
