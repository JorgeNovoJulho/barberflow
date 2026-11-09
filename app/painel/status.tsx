const messages: Record<string, string> = {
  invalido: "Confira os dados informados e tente novamente.",
  falha: "Não foi possível concluir a operação.",
  "negocio-criado": "Estabelecimento criado. Você já pode cadastrar seus serviços.",
  salvo: "Serviço salvo.",
  "servico-movido": "Ordem do catálogo atualizada.",
  "ordem-alterada": "Confira a ordem atual do catálogo antes de mover o serviço.",
  ativado: "Serviço reativado.",
  arquivado: "Serviço arquivado.",
  "profissional-salvo": "Profissional salvo.",
  "equipe-ordenada": "Ordem da equipe atualizada.",
  "equipe-alterada": "Confira a ordem atual da equipe antes de mover o profissional.",
  "vinculos-salvos": "Serviços vinculados.",
  "horario-salvo": "Horário salvo.",
  "horario-invalido": "Confira a ordem dos horários. O intervalo deve ficar dentro do expediente.",
  "cliente-salvo": "Cliente salvo.",
};

export function PanelStatus({ status }: { status?: string }) {
  return status && Object.hasOwn(messages, status) ? <p role="status">{messages[status]}</p> : null;
}
