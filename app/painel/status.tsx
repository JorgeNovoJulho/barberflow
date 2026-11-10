const messages: Record<string, string> = {
  invalido: "Confira os dados informados e tente novamente.",
  falha: "Não foi possível concluir a operação.",
  "negocio-criado": "Estabelecimento criado. Você já pode cadastrar seus serviços.",
  salvo: "Serviço salvo.",
  "servico-movido": "Ordem do catálogo atualizada.",
  "servico-excluido": "Serviço excluído do catálogo. O histórico foi preservado.",
  "servico-midia-invalida": "Confira os formatos e os limites de 5 MB para foto e 15 MB para vídeo.",
  "servico-midia-falha": "Não foi possível enviar a mídia. Selecione os arquivos novamente e tente salvar.",
  "ordem-alterada": "Confira a ordem atual do catálogo antes de mover o serviço.",
  ativado: "Serviço reativado.",
  arquivado: "Serviço arquivado.",
  "profissional-incluido": "Profissional incluído na equipe.",
  "profissional-salvo": "Profissional salvo.",
  "profissional-contatos": "Use um @usuário ou link de perfil do Instagram, WhatsApp com DDD e links HTTPS de Facebook, TikTok ou YouTube.",
  "profissional-permissao": "Sua conta não tem permissão para salvar este profissional.",
  "profissional-banco": "O banco recusou o cadastro do profissional. Tente novamente e, se persistir, informe o horário da tentativa ao suporte.",
  "profissional-imagem": "Selecione uma foto JPG, PNG, WebP ou AVIF de até 5 MB.",
  "profissional-upload": "Não foi possível enviar a foto. Selecione o arquivo novamente e tente salvar.",
  "equipe-ordenada": "Ordem da equipe atualizada.",
  "equipe-alterada": "Confira a ordem atual da equipe antes de mover o profissional.",
  "acesso-revogado": "Acesso da equipe revogado.",
  "vinculos-salvos": "Serviços vinculados.",
  "horario-salvo": "Horário salvo.",
  "horario-invalido": "Confira a ordem dos horários. O intervalo deve ficar dentro do expediente.",
  "cliente-imagem": "Não foi possível enviar a foto. Use JPG, PNG, WebP ou AVIF de até 5 MB.",
  "cliente-salvo": "Cliente salvo.",
};

export function PanelStatus({ status }: { status?: string }) {
  return status && Object.hasOwn(messages, status) ? <p role="status">{messages[status]}</p> : null;
}
