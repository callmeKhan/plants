import * as React from "react";
import { cn } from "@/lib/utils";

const Badge = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & { variant?: "default" | "secondary" | "success" | "warning" }
>(({ className, variant = "default", ...props }, ref) => {
  return (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variant === "default" && "bg-emerald-100 text-emerald-700",
        variant === "secondary" && "bg-gray-100 text-gray-600",
        variant === "success" && "bg-green-100 text-green-700",
        variant === "warning" && "bg-amber-100 text-amber-700",
        className
      )}
      {...props}
    />
  );
});
Badge.displayName = "Badge";

export { Badge };
