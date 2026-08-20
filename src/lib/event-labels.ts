export function getEventLabel(type: string, userName?: string) {
  const map: Record<string, string> = {
    ANALISE_SOLICITADA: `${userName ?? "Jogador"} solicitou análise`,
    SALA_CRIADA: "Sala permanente reservada no fluxo da análise",
    SALA_RESERVADA: "Sala permanente vinculada à análise",
    CODIGO_GERADO: "Código gerado para participante",
    PARTICIPANTE_ENTROU: `${userName ?? "Participante"} entrou`,
    ANALISTA_ENTROU: `${userName ?? "Analista"} entrou`,
    PARTICIPANTE_SAIU: `${userName ?? "Participante"} saiu da sala`,
    PARTICIPANTE_REMOVIDO: `${userName ?? "Participante"} foi removido da sala`,
    TRANSMISSAO_INICIADA: `${userName ?? "Participante"} iniciou transmissão`,
    TRANSMISSAO_ENCERRADA: `${userName ?? "Participante"} encerrou transmissão`,
    ANALISE_FINALIZADA: "Análise finalizada",
    ANALISE_CANCELADA: "Análise cancelada",
    IRREGULARIDADE_REGISTRADA: "Irregularidade registrada",
    RESULTADO_REGISTRADO: "Resultado registrado",
    CODIGO_EXPIRADO: "Código expirado",
  };
  return map[type] ?? type;
}
