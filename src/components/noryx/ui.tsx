import { cn } from "@/lib/utils";
import type { HTMLAttributes, ReactNode } from "react";

export function NxCard({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/[0.06] bg-[#14171c]",
        className,
      )}
      {...props}
    />
  );
}

export function NxCardHeader({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/[0.05] px-5 py-4">
      <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
      {action}
    </div>
  );
}

export function NxStat({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
  tone: "green" | "purple" | "orange" | "blue" | "yellow";
}) {
  const tones = {
    green: "bg-white/12 text-white",
    purple: "bg-white/12 text-white",
    orange: "bg-white/12 text-white",
    blue: "bg-white/12 text-white",
    yellow: "bg-white/12 text-white",
  };
  return (
    <NxCard className="px-4 py-4">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            tones[tone],
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-xs text-zinc-500">{label}</p>
          <p className="mt-0.5 text-2xl font-semibold tracking-tight text-white">
            {value}
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">{hint}</p>
        </div>
      </div>
    </NxCard>
  );
}

export function TypeBadge({
  label,
  tone,
}: {
  label: string;
  tone: "green" | "blue" | "purple" | "orange" | "yellow" | "zinc";
}) {
  const tones = {
    green: "bg-emerald-500/12 text-emerald-300",
    blue: "bg-sky-500/12 text-sky-300",
    purple: "bg-violet-500/12 text-violet-300",
    orange: "bg-orange-500/12 text-orange-300",
    yellow: "bg-amber-500/12 text-amber-300",
    zinc: "bg-zinc-500/15 text-zinc-300",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium",
        tones[tone],
      )}
    >
      {label}
    </span>
  );
}

export function LiveMark() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-emerald-400">
      <span className="flex h-3.5 items-end gap-px">
        <span className="h-1.5 w-0.5 animate-pulse rounded-full bg-emerald-400" />
        <span className="h-3.5 w-0.5 animate-pulse rounded-full bg-emerald-400 [animation-delay:120ms]" />
        <span className="h-2 w-0.5 animate-pulse rounded-full bg-emerald-400 [animation-delay:240ms]" />
      </span>
      Ao vivo
    </span>
  );
}

export function StatusDot({
  online,
  label,
}: {
  online: boolean;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px]">
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          online ? "bg-emerald-400" : "bg-zinc-500",
        )}
      />
      <span className={online ? "text-emerald-400" : "text-zinc-500"}>{label}</span>
    </span>
  );
}

export function PageHead({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-6">
      <h1 className="text-xl font-semibold text-white">{title}</h1>
      <p className="mt-1 text-sm text-zinc-500">{description}</p>
    </div>
  );
}
