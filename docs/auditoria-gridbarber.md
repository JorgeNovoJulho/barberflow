# Auditoria funcional do GridBarber

Inventário inicial das telas públicas e da sessão de proprietário observadas
em 9 de novembro de 2026, cruzado com as rotas e migrações do BARBERFLOW.
O inventário cobre os controles visíveis, inclusive estados vazios. A sessão
de proprietário não fornece evidência sobre papéis internos, webhooks,
entrega de convites, eventos em segundo plano ou regras de bloqueio de planos.

| Tela da referência | Funções, campos, cards e listas observados | Situação no BARBERFLOW |
| --- | --- | --- |
| Início público | Apresentação da plataforma, navegação, chamada para teste, funcionalidades, planos e links legais | Presentes. Os endereços dos documentos legais dependem da configuração do ambiente. |
| Planos | Mensal, anual, benefícios e teste | Presentes, com preços e duração do teste configuráveis pelo master. |
| Cadastro e autenticação | Cadastro, login e recuperação de senha | Presentes. O acesso exige confirmação de e-mail conforme as regras do ambiente. |
| Catálogo público | Lista de estabelecimentos e acesso ao perfil público | Presente. O BARBERFLOW inclui outros segmentos de beleza e bem-estar. |
| Perfil público | Capa, logo, galeria, contatos, endereço, mapa, horário, equipe, serviços, próximos horários, compartilhamento e avaliações | Presentes. A configuração da localização ainda usa endereço e URL do mapa. |
| Agendamento público | Seleção de serviço, profissional, data e horário, confirmação e identificação do cliente | Presentes. Cancelamento e remarcação usam as regras do estabelecimento. |
| Início do painel | Novo agendamento, filtros de hoje, 7 e 30 dias, indicadores, próximos atendimentos e quadro Hoje em números | Presentes. O recebido em comandas fica protegido pela senha financeira. |
| Notificações | Contador, novas reservas, data da notificação, link para a agenda e marcar todas como lidas | Presentes na Visão geral. O acesso pelo cabeçalho de todas as telas está pendente. |
| Agenda | Anterior, hoje, próximo, seletor de data, visões dia, semana e lista, bloquear horário e novo atendimento | Presentes. A lista do BARBERFLOW cobre sete dias a partir da data selecionada. |
| Clientes | Cadastro, busca, retorno de 15, 20, 30, 45, 60 e 90 dias, ordenação, última visita, quantidade de atendimentos, total, histórico e WhatsApp | Presentes. A base financeira exibida é o valor de comandas fechadas. |
| Profissionais | Cadastro, edição, ordenação, foto, comissão, horário próprio ou herdado, equipe com acesso ao painel e convite | Parcial. O BARBERFLOW tem cadastro, foto por URL, comissões, vínculo com serviços e horário próprio. Faltam upload direto da foto, ordenação, herança do horário e convites com permissões. |
| Serviços | Cadastro, edição, reordenação e exclusão | Cadastro, edição, ordenação, arquivamento e reativação presentes. Falta confirmar como a referência trata exclusão de serviços com histórico. |
| Financeiro e relatórios | Intervalo de datas, filtro por profissional, comissão, faturamento diário e por profissional, serviços mais vendidos, dias e horários movimentados e CSV | Presentes. O BARBERFLOW inclui ainda caixa, recebimentos e pagamentos, guias de despesas, produtos vendidos e comissões de produtos. |
| Fidelidade | Configuração da meta e do benefício, todos os serviços ou seleção, clientes mais próximos e horários vagos | Presentes. A seleção vazia representa todos os serviços. |
| Assinatura | Teste, planos mensal e anual, instruções de pagamento, cópia de Pix, troca de modalidade e histórico | Presentes com registro manual pelo master. Cobrança automática e bloqueio por vencimento ainda não foram validados na referência. |
| Configurações do estabelecimento | Compartilhamento, publicação, nome, endereço, contatos, paleta, localização, mídia, galeria, expediente, regras de reserva e avaliações | Presentes, com compartilhamento pelo painel, atalhos de paleta, cor hexadecimal, reorganização e remoção de fotos, CEP e expediente copiável. Falta conferir a equivalência dos controles de localização e de avaliações na sessão autenticada. |
| Meu perfil | Link de perfil acessível a partir do painel | O BARBERFLOW já tem conta e aparência. A equivalência dos campos de perfil ainda requer inspeção. |

## Sequência de fechamento

1. Equipe e permissões. Confirmar papéis e limites de acesso antes de
   implementar convites e testar o isolamento entre estabelecimentos.
2. Profissionais e publicação. Fechar ordenação, foto, herança de expediente
   e os controles visuais de configuração.
3. Revisar detalhes dos fluxos com dados de teste. Cobrir estados com
   agendamentos, clientes, pagamentos, avaliações e diferentes permissões.
4. Refatorar a interface após essa revisão, com testes de responsividade
   e movimento reduzido. Usar a pasta de referências visuais indicada pelo
   usuário como direção de arte.
