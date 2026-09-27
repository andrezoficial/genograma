import { Instagram } from "lucide-react";
import { cn } from "@/lib/utils";

export const CREDITS_NAME = "Andrés Suárez Moreno";
export const CREDITS_HANDLE = "@andres.suarez.moreno";
export const CREDITS_URL = "https://www.instagram.com/andres.suarez.moreno/";

export function Credits({
  variant = "footer",
  className,
}: {
  variant?: "footer" | "bar" | "icon";
  className?: string;
}) {
  if (variant === "icon") {
    return (
      <a
        href={CREDITS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "inline-flex size-10 items-center justify-center text-bar-foreground hover:bg-white/10 hover:text-bar-foreground md:hidden",
          className,
        )}
        aria-label={`${CREDITS_NAME} en Instagram`}
      >
        <Instagram className="size-4" />
      </a>
    );
  }

  if (variant === "bar") {
    return (
      <a
        href={CREDITS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "hidden min-w-0 items-center gap-1.5 text-xs tracking-wide text-bar-foreground/55 transition-colors duration-150 hover:text-bar-foreground md:inline-flex",
          className,
        )}
      >
        <span className="truncate">{CREDITS_NAME}</span>
        <Instagram className="size-3.5 shrink-0 opacity-80" />
      </a>
    );
  }

  return (
    <a
      href={CREDITS_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group flex min-h-11 items-center gap-2 rounded-md px-1 py-1 text-muted-foreground transition-colors duration-150 hover:text-foreground",
        className,
      )}
    >
      <Instagram className="size-3.5 shrink-0" />
      <span className="min-w-0 leading-tight">
        <span className="block text-xs font-medium tracking-wide text-foreground/80 group-hover:text-foreground">
          {CREDITS_NAME}
        </span>
        <span className="block text-xs tracking-wide">{CREDITS_HANDLE}</span>
      </span>
    </a>
  );
}
