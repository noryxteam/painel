import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

type Tone = "default" | "live" | "success" | "warning" | "danger" | "muted";

const tones: Record<Tone, string> = {
  default: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  live: "bg-red-500/15 text-red-300 border-red-500/30",
  success: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  warning: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  danger: "bg-red-500/15 text-red-300 border-red-500/30",
  muted: "bg-zinc-800 text-zinc-400 border-zinc-700",
};

export function Badge({
  tone = "default",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide sm:px-2.5 sm:py-1 sm:text-xs",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
