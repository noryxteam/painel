import { noryxPath } from "@/lib/noryx";

export const noryxTeam = [
  { name: "Murilo", role: "Dono", status: "online" as const, initials: "MU" },
  { name: "Lucas", role: "Administrador", status: "online" as const, initials: "LU" },
  { name: "Victor", role: "Moderador", status: "away" as const, initials: "VI" },
  { name: "Ana", role: "Analista", status: "online" as const, initials: "AN" },
  { name: "Rafael", role: "Administrador", status: "online" as const, initials: "RA" },
  { name: "Bianca", role: "Suporte", status: "away" as const, initials: "BI" },
  { name: "Caio", role: "Analista", status: "online" as const, initials: "CA" },
  { name: "Helena", role: "Moderador", status: "online" as const, initials: "HE" },
];

export const noryxCalls = [
  {
    name: "Análise de Partida #032",
    type: "Análise",
    typeTone: "green" as const,
    access: "Restrita",
    people: "12/15",
    status: "Ao vivo",
  },
  {
    name: "Call Suporte SUP 01",
    type: "Suporte",
    typeTone: "orange" as const,
    access: "Privada",
    people: "4/10",
    status: "Em andamento",
  },
  {
    name: "Análise Mobile MOB 07",
    type: "Análise",
    typeTone: "green" as const,
    access: "Pública",
    people: "8/10",
    status: "Ao vivo",
  },
  {
    name: "Reunião de Equipe",
    type: "Reunião",
    typeTone: "purple" as const,
    access: "Restrita",
    people: "6/8",
    status: "Em andamento",
  },
  {
    name: "Treinamento Emulador",
    type: "Treinamento",
    typeTone: "blue" as const,
    access: "Privada",
    people: "9/12",
    status: "Ao vivo",
  },
];

export const noryxTickets = [
  { id: "#1587", title: "Sem áudio na call MOB 12", category: "Suporte", time: "há 4 min" },
  { id: "#1584", title: "Pedido de cargo Analista", category: "Acesso", time: "há 18 min" },
  { id: "#1579", title: "Transmissão travando no iPhone", category: "Técnico", time: "há 41 min" },
  { id: "#1571", title: "Convite expirado para novo membro", category: "Membros", time: "há 2 h" },
];

export const noryxActivity = [
  { who: "Murilo", text: "alterou o acesso da call Análise #032 para restrita.", time: "há 2 min", tone: "green" as const },
  { who: "Lucas", text: "adicionou o membro Rafael à equipe.", time: "há 11 min", tone: "blue" as const },
  { who: "Victor", text: "moveu 3 tickets para aguardando resposta.", time: "há 27 min", tone: "yellow" as const },
  { who: "Ana", text: "criou o cargo Analista Mobile.", time: "há 1 h", tone: "purple" as const },
  { who: "Helena", text: "encerrou a call Treinamento Emulador.", time: "há 2 h", tone: "orange" as const },
];

export const noryxRoles = [
  { name: "Dono", members: 1, color: "#4ade80", desc: "Acesso total ao sistema, calls e equipe." },
  { name: "Administrador", members: 3, color: "#60a5fa", desc: "Gerencia calls, membros, cargos e tickets." },
  { name: "Moderador", members: 6, color: "#c084fc", desc: "Modera calls, remove participantes e abre tickets." },
  { name: "Analista", members: 12, color: "#fb923c", desc: "Entra em calls de análise e registra resultado." },
  { name: "Suporte", members: 4, color: "#facc15", desc: "Atende tickets e respostas rápidas." },
  { name: "Membro", members: 3816, color: "#94a3b8", desc: "Acesso às calls liberadas pela equipe." },
];

export const noryxPermissions = [
  "Entrar em calls",
  "Criar call",
  "Restringir call",
  "Gerenciar membros",
  "Criar cargos",
  "Editar permissões",
  "Ver logs",
  "Responder tickets",
  "Configurar sistema",
];

export const noryxPermissionMatrix: Record<string, boolean[]> = {
  Dono: [true, true, true, true, true, true, true, true, true],
  Administrador: [true, true, true, true, true, false, true, true, true],
  Moderador: [true, true, true, false, false, false, true, true, false],
  Analista: [true, false, false, false, false, false, false, false, false],
  Suporte: [true, false, false, false, false, false, false, true, false],
  Membro: [true, false, false, false, false, false, false, false, false],
};

export const noryxMembers = [
  { name: "Murilo", cargo: "Dono", status: "Online", joined: "12/01/2025", calls: 184 },
  { name: "Lucas", cargo: "Administrador", status: "Online", joined: "03/02/2025", calls: 97 },
  { name: "Victor", cargo: "Moderador", status: "Ausente", joined: "18/03/2025", calls: 64 },
  { name: "Ana Costa", cargo: "Analista", status: "Online", joined: "22/04/2025", calls: 211 },
  { name: "Rafael Nunes", cargo: "Administrador", status: "Online", joined: "09/05/2025", calls: 73 },
  { name: "Bianca Lima", cargo: "Suporte", status: "Ausente", joined: "01/06/2025", calls: 28 },
  { name: "Caio Martins", cargo: "Analista", status: "Online", joined: "14/06/2025", calls: 142 },
  { name: "Helena Dias", cargo: "Moderador", status: "Online", joined: "30/06/2025", calls: 55 },
];

export const noryxInvites = [
  { email: "pedro@org.com", cargo: "Analista", status: "Pendente", sent: "há 2 h" },
  { email: "julia@org.com", cargo: "Membro", status: "Pendente", sent: "há 6 h" },
  { email: "thiago@org.com", cargo: "Moderador", status: "Expirado", sent: "há 3 dias" },
];

export const noryxReplies = [
  { title: "Áudio da call", body: "Confirme se o microfone está liberado no navegador e se o fone não está ensurdecido na call." },
  { title: "Acesso restrito", body: "Essa call é restrita. Peça a um administrador para liberar o seu cargo antes de entrar." },
  { title: "Convite", body: "O convite expira em 48 horas. Se caducou, solicite um novo pelo ticket de membros." },
];

export const noryxLogs = [
  { at: "20/08/2026 11:02", actor: "Murilo", action: "Alterou acesso", target: "Análise #032" },
  { at: "20/08/2026 10:51", actor: "Lucas", action: "Adicionou membro", target: "Rafael Nunes" },
  { at: "20/08/2026 10:33", actor: "Victor", action: "Atualizou ticket", target: "#1584" },
  { at: "20/08/2026 09:18", actor: "Ana", action: "Criou cargo", target: "Analista Mobile" },
  { at: "20/08/2026 08:44", actor: "Sistema", action: "Backup automático", target: "snapshot-0820" },
];

export const noryxQuick = [
  { href: noryxPath("calls"), label: "Criar Call", tone: "green" as const },
  { href: noryxPath("cargos"), label: "Criar Cargo", tone: "purple" as const },
  { href: noryxPath("membros"), label: "Adicionar Membro", tone: "blue" as const },
  { href: noryxPath("permissoes"), label: "Gerenciar Permissões", tone: "orange" as const },
  { href: noryxPath("tickets"), label: "Abrir Ticket", tone: "yellow" as const },
  { href: noryxPath("configuracoes"), label: "Configurações", tone: "zinc" as const },
];
