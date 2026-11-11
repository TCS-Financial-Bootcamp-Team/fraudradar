import * as React from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        destructive: "bg-signal text-white",
        outline: "border-border text-foreground",
        ghost: "hover:bg-muted text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  });
}

export interface StatusDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  color?: string;
  children?: React.ReactNode;
}

export function StatusDot({
  color = "primary",
  children,
  className,
  ...props
}: StatusDotProps) {
  const dotColor =
    color.startsWith("#") || color.startsWith("rgb") || color.startsWith("var(")
      ? color
      : color.startsWith("--")
      ? `var(${color})`
      : `var(--${color})`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-sm text-foreground",
        className
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: dotColor }}
      />
      {children && <span>{children}</span>}
    </span>
  );
}

export { Badge, badgeVariants };
