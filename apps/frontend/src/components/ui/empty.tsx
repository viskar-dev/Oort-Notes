import { cn } from "cn"

/**
 * Empty state, from the shadcn/ui "empty" registry component, skinned for
 * Oort: dashed hairline frame, foreground-dimmed text — nothing bright.
 *
 * https://ui.shadcn.com/docs/components/empty
 */
function Empty({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty"
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line bg-white/[0.02] p-8 text-center",
        className
      )}
      {...props}
    />
  )
}

function EmptyHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-header"
      className={cn(
        "flex max-w-sm flex-col items-center gap-0.5",
        className
      )}
      {...props}
    />
  )
}

function EmptyMedia({
  className,
  variant = "icon",
  ...props
}: React.ComponentProps<"div"> & { variant?: "default" | "icon" }) {
  return (
    <div
      data-slot="empty-media"
      data-variant={variant}
      className={cn(
        "mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none",
        variant === "icon" &&
          "flex size-10 items-center justify-center rounded-full border border-line bg-white/[0.04] text-fg-3 [&_svg:not([class*='size-'])]:size-4.5",
        variant === "default" && "bg-transparent text-fg-3",
        className
      )}
      {...props}
    />
  )
}

function EmptyTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-title"
      className={cn("text-sm font-medium leading-none tracking-[-0.01em] text-fg-1", className)}
      {...props}
    />
  )
}

function EmptyDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="empty-description"
      className={cn(
        "text-sm/relaxed text-fg-3 [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-fg-1",
        className
      )}
      {...props}
    />
  )
}

function EmptyContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-content"
      className={cn("mt-3 flex w-full max-w-sm flex-col items-center gap-2.5", className)}
      {...props}
    />
  )
}

export { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent }
