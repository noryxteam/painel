"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Bell,
  Copy,
  Check,
  Crown,
  DatabaseBackup,
  KeyRound,
  LayoutDashboard,
  Lock,
  MailPlus,
  Menu,
  MessageSquare,
  Phone,
  ScrollText,
  Settings,
  Ticket,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { NORYX_GATE, NORYX_NAV, noryxPath, noryxSecretUrl } from "@/lib/noryx";
import { cn } from "@/lib/utils";

const ICONS = {
  "": LayoutDashboard,
  calls: Phone,
  membros: Users,
  cargos: Crown,
  permissoes: KeyRound,
  equipe: UserCog,
  convites: MailPlus,
  tickets: Ticket,
  respostas: MessageSquare,
  logs: ScrollText,
  configuracoes: Settings,
  backup: DatabaseBackup,
};

function navActive(pathname: string, href: string) {
  if (href === noryxPath()) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NoryxMark() {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-[#0b0d10]">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
        <path d="M12 2 4.5 5.2v6.1c0 5.1 3.3 9.7 7.5 10.7 4.2-1 7.5-5.6 7.5-10.7V5.2L12 2Zm0 3.1 5.3 2.2v4c0 3.6-2.2 6.9-5.3 7.8-3.1-.9-5.3-4.2-5.3-7.8v-4L12 5.1Z" />
        <path d="M11.2 8.2h1.6v2.4h2.1v1.5h-2.1v2.6h-1.6v-2.6H9.2V10.6h2z" />
      </svg>
    </span>
  );
}

export function NoryxShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const secretUrl = noryxSecretUrl();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const copy = async () => {
    const value = `${window.location.origin}/${NORYX_GATE}`;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 px-5 py-5">
        <NoryxMark />
        <div>
          <p className="text-[15px] font-bold tracking-[0.18em] text-white">NORYX</p>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-400">
            Painel Administrativo
          </p>
        </div>
      </div>

      <nav className="sidebar-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {NORYX_NAV.map((group) => (
          <div key={group.label} className="mb-5">
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = ICONS[item.key];
                const active = navActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition",
                        active
                          ? "border-l-2 border-emerald-400 bg-emerald-500/10 font-medium text-emerald-400 pl-[10px]"
                          : "border-l-2 border-transparent text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/[0.06] p-3">
        <div className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5">
          <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-semibold text-emerald-300">
            MU
            <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0d0f12] bg-emerald-400" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">Murilo</p>
            <p className="truncate text-[11px] text-zinc-500">Dono do Sistema</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh min-h-0 overflow-hidden bg-[#0b0d10] text-zinc-200">
      <aside className="hidden w-[248px] shrink-0 border-r border-white/[0.06] bg-[#0d0f12] lg:flex lg:flex-col">
        {sidebar}
      </aside>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Fechar menu"
            onClick={() => setOpen(false)}
          />
          <aside className="relative z-10 h-full w-[248px] bg-[#0d0f12]">{sidebar}</aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.06] bg-[#0d0f12] px-4">
          <button
            type="button"
            className="rounded-lg p-2 text-zinc-400 hover:bg-white/[0.05] lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>

          <div className="mx-auto flex min-w-0 max-w-3xl flex-1 items-center gap-2 rounded-xl border border-white/[0.07] bg-[#12151a] px-3 py-1.5">
            <Lock className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
            <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-400 sm:text-xs">
              {secretUrl}
            </p>
            <button
              type="button"
              onClick={() => void copy()}
              className="rounded-md p-1 text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300"
              title="Copiar URL"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              className="relative rounded-lg p-2 text-zinc-400 hover:bg-white/[0.05]"
              aria-label="Notificações"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-500 px-1 text-[9px] font-bold text-white">
                3
              </span>
            </button>
            <div className="hidden items-center gap-2 sm:flex">
              <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20 text-[11px] font-semibold text-emerald-300">
                MU
                <span className="absolute right-0 bottom-0 h-2 w-2 rounded-full border-2 border-[#0d0f12] bg-emerald-400" />
              </span>
              <div className="leading-tight">
                <p className="text-xs font-medium text-white">Murilo</p>
                <p className="text-[10px] text-zinc-500">Dono</p>
              </div>
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6">
            {children}
            <p className="mt-10 pb-4 text-center text-[11px] text-zinc-600">
              © 2026 NORYX SYSTEM. Todos os direitos reservados.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
