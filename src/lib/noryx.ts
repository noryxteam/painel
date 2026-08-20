export const NORYX_GATE =
  "3kF8xP4m29lqT7aB42nG6vR5sK9dL2pXjH4wQ7zY1mN3cP0eF6uV9bT2rD8gL5kJ1tH7wQz3yX0eA6nR9tC4vB2mP8j";

export const NORYX_DISPLAY_HOST = "seudominio.com";

export function noryxPath(segment = "") {
  const clean = segment.replace(/^\/+|\/+$/g, "");
  return clean ? `/${NORYX_GATE}/${clean}` : `/${NORYX_GATE}`;
}

export function noryxSecretUrl(origin?: string) {
  const host = origin?.replace(/\/$/, "") || `https://${NORYX_DISPLAY_HOST}`;
  return `${host}/${NORYX_GATE}`;
}

export type NoryxNavKey =
  | ""
  | "calls"
  | "membros"
  | "cargos"
  | "permissoes"
  | "equipe"
  | "convites"
  | "tickets"
  | "respostas"
  | "logs"
  | "configuracoes"
  | "backup";

export const NORYX_NAV = [
  {
    label: "Navegação",
    items: [
      { key: "" as const, href: noryxPath(), label: "Dashboard" },
      { key: "calls" as const, href: noryxPath("calls"), label: "Calls" },
      { key: "membros" as const, href: noryxPath("membros"), label: "Membros" },
      { key: "cargos" as const, href: noryxPath("cargos"), label: "Cargos" },
      { key: "permissoes" as const, href: noryxPath("permissoes"), label: "Permissões" },
      { key: "equipe" as const, href: noryxPath("equipe"), label: "Equipe / Perfis" },
      { key: "convites" as const, href: noryxPath("convites"), label: "Convites" },
    ],
  },
  {
    label: "Suporte",
    items: [
      { key: "tickets" as const, href: noryxPath("tickets"), label: "Tickets" },
      { key: "respostas" as const, href: noryxPath("respostas"), label: "Respostas Rápidas" },
    ],
  },
  {
    label: "Sistema",
    items: [
      { key: "logs" as const, href: noryxPath("logs"), label: "Logs de Atividade" },
      { key: "configuracoes" as const, href: noryxPath("configuracoes"), label: "Configurações" },
      { key: "backup" as const, href: noryxPath("backup"), label: "Backup" },
    ],
  },
];
