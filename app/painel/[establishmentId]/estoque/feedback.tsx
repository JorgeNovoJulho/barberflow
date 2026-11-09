const messages: Record<string, string> = {
  invalido: "Confira os dados informados.",
  falha: "Não foi possível concluir a operação.",
  sku: "Já existe um produto com esse código.",
  salvo: "Produto salvo.",
  saldo: "O ajuste ultrapassa o limite de estoque ou deixaria o saldo negativo.",
  movimento: "Movimentação registrada.",
  item: "Comanda atualizada.",
  fechada: "Comanda fechada e estoque atualizado.",
  fechamento: "Conclua o atendimento e confira o estoque de todos os itens antes de fechar.",
};

export function StockFeedback({ status }: { status?: string }) {
  return status && Object.hasOwn(messages, status) ? <p role="status">{messages[status]}</p> : null;
}
