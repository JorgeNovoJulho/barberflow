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
  "profissional-contatos": "Confira o usuário do Instagram, o WhatsApp com DDD e os links HTTPS das redes sociais.",
  "profissional-imagem": "Selecione uma foto JPG, PNG, WebP ou AVIF de até 5 MB.",
  "profissional-upload": "Não foi possível enviar a foto. Selecione o arquivo novamente e tente salvar.",
  "equipe-ordenada": "Ordem da equipe atualizada.",
  "equipe-alterada": "Confira a ordem atual da equipe antes de mover o profissional.",
  "acesso-revogado": "Acesso da equipe revogado.",
  "vinculos-salvos": "Serviços vinculados.",
  "horario-salvo": "Horário salvo.",
  "horario-invalido": "Confira a ordem dos horários. O intervalo deve ficar dentro do expediente.",
  "cliente-salvo": "Cliente salvo.",
};

export function PanelStatus({ status }: { status?: string }) {
  return status && Object.hasOwn(messages, status) ? <p role="status">{messages[status]}</p> : null;
}
