import { cn } from "cn";

const Skeleton = ({ className, ...props }: React.ComponentProps<"div">) => 
  (
    <div
      data-slot="skeleton"
      className={cn("bg-muted animate-pulse rounded-md", className)}
      {...props}
    />
  )


export { Skeleton };
