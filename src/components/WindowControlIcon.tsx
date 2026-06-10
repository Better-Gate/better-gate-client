import { cn } from "@/lib/utils";

type WindowControlIconType = "minimize" | "maximize" | "restore" | "close";

interface WindowControlIconProps {
  type: WindowControlIconType;
  className?: string;
}

export function WindowControlIcon({ type, className }: WindowControlIconProps) {
  if (type === "minimize") {
    return (
      <span className={cn("relative block h-3 w-3", className)}>
        <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-current" />
      </span>
    );
  }

  if (type === "maximize") {
    return (
      <span
        className={cn(
          "block h-3 w-3 border border-current",
          className,
        )}
      />
    );
  }

  if (type === "restore") {
    return (
      <span className={cn("relative block h-3 w-3", className)}>
        <span className="absolute left-[3px] top-0 block h-[9px] w-[9px] border border-current bg-background" />
        <span className="absolute bottom-0 left-0 block h-[9px] w-[9px] border border-current bg-background" />
      </span>
    );
  }

  return (
    <span className={cn("relative block h-3 w-3", className)}>
      <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 rotate-45 bg-current" />
      <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 -rotate-45 bg-current" />
    </span>
  );
}
