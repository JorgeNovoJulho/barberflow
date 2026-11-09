const messages: Record<string, string> = {
  invalido: "Confira os dados informados.",
  falha: "Não foi possível concluir a operação.",
  sku: "Já existe um produto com esse código.",
  barcode: "Já existe um produto com esse código de barras.",
  "promocao-salva": "Promoção salva.",
  "promocao-removida": "Promoção removida.",
  "promocao-invalida": "A oferta deve ficar abaixo do preço normal e terminar até a validade de um produto à venda que vença nos próximos 30 dias.",
  "promocao-vencida": "Uma promoção venceu. Atualize a quantidade do item, mesmo que ela continue igual, para recalcular antes de fechar.",
  salvo: "Produto salvo.",
  excluido: "Produto excluído do catálogo. O histórico foi preservado.",
  congelado: "Produto congelado e indisponível para venda.",
  descongelado: "Produto disponível para venda.",
  "produto-indisponivel": "O produto foi congelado ou excluído. Retire-o da comanda ou escolha outro item.",
  saldo: "O ajuste ultrapassa o limite de estoque ou deixaria o saldo negativo.",
  movimento: "Movimentação registrada.",
  item: "Comanda atualizada.",
  fechada: "Comanda fechada e estoque atualizado.",
  fechamento: "Conclua o atendimento, confira o estoque e retire produtos indisponíveis antes de fechar.",
};

export function StockFeedback({ status }: { status?: string }) {
  return status && Object.hasOwn(messages, status) ? <p role="status">{messages[status]}</p> : null;
}
