import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-[15px] font-normal transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-blue-500 text-white shadow-sm hover:bg-blue-600",
        destructive:
          "bg-red-500 text-white shadow-sm hover:bg-red-600",
        outline:
          "border border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10",
        secondary:
          "bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-white/15",
        ghost: "hover:bg-gray-100 dark:hover:bg-white/10",
        link: "text-blue-500 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 md:h-10 px-5 py-2.5",
        sm: "h-9 md:h-8 rounded-lg px-3 text-sm",
        lg: "h-12 md:h-11 rounded-xl px-6",
        icon: "h-11 w-11 md:h-10 md:w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
    return (
      (<Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
        {...props} />)
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }