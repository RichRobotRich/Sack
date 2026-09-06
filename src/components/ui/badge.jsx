import * as React from "react"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-blue-500/10 text-blue-600 dark:text-blue-400",
        secondary:
          "border-transparent bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300",
        destructive:
          "border-transparent bg-red-500/10 text-red-600 dark:text-red-400",
        outline: "border-gray-300 dark:border-white/10 text-gray-700 dark:text-gray-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  ...props
}) {
  return (<div className={cn(badgeVariants({ variant }), className)} {...props} />);
}

export { Badge, badgeVariants }