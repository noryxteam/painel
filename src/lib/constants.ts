export const APP_NAME = "Sistema de Análise de Partidas";

export const BETA_USERS = {
  ygor: { id: "beta-ygor", name: "Ygor", label: "Ygor (Solicitante)" },
  pedro: { id: "beta-pedro", name: "Pedro", label: "Pedro (Analisado)" },
  admin: { id: "beta-admin", name: "Administrador", label: "Administrador" },
} as const;

export type BetaUserKey = keyof typeof BETA_USERS;

export const SESSION_COOKIE = "sap_beta_user";
export const ACCESS_COOKIE = "sap_analysis_access";
export const ROOM_COOKIE = "sap_room_access";

export const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 5;

export const STATUS_LABELS: Record<string, string> = {
  PENDENTE: "Pendente",
  AGUARDANDO_PARTICIPANTE: "Aguardando participante",
  AGUARDANDO_ANALISTA: "Aguardando analista",
  SALA_ATIVA: "Sala ativa",
  TRANSMISSAO_ATIVA: "Ao vivo",
  FINALIZADA: "Finalizada",
  CANCELADA: "Cancelada",
  EXPIRADA: "Expirada",
  IRREGULARIDADE: "Irregularidade",
};

export const ROOM_STATUS_LABELS: Record<string, string> = {
  DISPONIVEL: "Disponível",
  AGUARDANDO_PARTICIPANTES: "Aguardando participantes",
  EM_ANALISE: "Em análise",
  TRANSMISSAO_ATIVA: "Transmissão ativa",
  ENCERRANDO: "Encerrando",
  COM_PROBLEMA: "Com problema",
};

export const RESULT_LABELS: Record<string, string> = {
  APROVADO: "Aprovado",
  IRREGULARIDADE: "Irregularidade",
  CANCELADA: "Cancelada",
};
