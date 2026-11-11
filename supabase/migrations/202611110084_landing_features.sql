update public.barberflow_landing_blocks
set body = 'Receba reservas online, acompanhe sua equipe e gerencie comandas, estoque, vitrine e financeiro em um só painel.'
where section = 'hero' and title = 'Mais tempo para atender. Mais controle para crescer.'
  and body = 'Agenda e gestão para profissionais, equipes e negócios de beleza e bem-estar.';

update public.barberflow_landing_blocks
set body = 'Agendamento por profissional, com visão por dia, semana e mês. O cliente pode reservar sem conta e consultar a reserva com um código.'
where section = 'funcionalidades' and title = 'Agenda online'
  and body = 'Horários por profissional e agendamento pelo cliente.';

update public.barberflow_landing_blocks
set body = 'Acompanhe contas a pagar e a receber, fluxo de caixa, fechamentos e comissões sobre serviços e produtos.'
where section = 'funcionalidades' and title = 'Financeiro'
  and body = 'Acompanhe receitas, comissões e serviços mais procurados.';

update public.barberflow_landing_blocks
set body = 'Inclua serviços e produtos na mesma comanda. Controle estoque e validade, calcule preços com margens e monte ofertas para itens perto do vencimento.'
where section = 'estoque' and title = 'Serviços e produtos na mesma comanda'
  and body = 'Em desenvolvimento. Inclua produtos vendidos durante o atendimento e reúna tudo em uma única cobrança.';

update public.barberflow_landing_blocks
set body = 'Na página do estabelecimento, escolha o serviço, o profissional e um horário. Você pode reservar sem conta e acompanhar a reserva com o código de confirmação.'
where section = 'duvidas' and title = 'Como é feito o agendamento?'
  and body = 'O cliente escolhe serviço, profissional e horário pela página do negócio.';

insert into public.barberflow_landing_blocks(section,title,body,image_url,image_alt,position)
select 'funcionalidades', feature.title, feature.body, '', '', feature.position
from (values
  ('Vitrine com Pix', 'Venda produtos para retirada e acompanhe novos pedidos, pagamentos e retiradas pelo painel.', 75),
  ('Notificações com som', 'Receba avisos de novas reservas, cancelamentos e pedidos da vitrine enquanto acompanha o painel.', 80),
  ('Editor de capas', 'Personalize a página pública com modelos de capa, fotos, textos, cores e efeitos.', 85)
) as feature(title,body,position)
where not exists (
  select 1 from public.barberflow_landing_blocks b where b.section='funcionalidades' and b.title=feature.title
);
