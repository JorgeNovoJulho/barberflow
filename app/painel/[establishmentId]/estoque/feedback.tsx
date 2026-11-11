const messages: Record<string, string> = {
  invalido: "Confira os dados informados.",
  "limite-vitrine": "A vitrine atingiu o limite de produtos ativos do seu plano. Retire um produto da vitrine ou consulte sua assinatura.",
  falha: "Não foi possível concluir a operação.",
  sku: "Já existe um produto com esse código.",
  barcode: "Já existe um produto com esse código de barras.",
  "promocao-salva": "Promoção salva.",
  "promocao-removida": "Promoção removida.",
  "margem-invalida": "Informe um custo unitário maior que zero para calcular o preço com margem.",
  "promocao-invalida": "Informe um custo válido, escolha 3, 5 ou 10 unidades em estoque e use até 20% de acréscimo. A oferta deve ficar abaixo do preço normal e terminar até a validade do produto, dentro dos próximos 30 dias.",
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
