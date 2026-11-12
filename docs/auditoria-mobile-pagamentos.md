# Auditoria mobile e segurança dos pagamentos

## Interface e desempenho

| Ponto revisado | Correção ou resultado |
| --- | --- |
| Campos de data, arquivos, mídia incorporada e botões em cards estreitos | Limites pela largura do contêiner, quebra de rótulos longos e tamanho mínimo de fonte nos controles. |
| Cabeçalho dos pedidos | Em telas estreitas, o valor e o status ganham espaço abaixo dos dados do pedido. |
| Calendário mensal | Células mais compactas com altura mínima de 44 px. |
| Medição no Chrome | 35 combinações de sete páginas públicas e cinco larguras (320, 360, 393, 768 e 1024 px). Largura do documento igual à da janela e nenhum elemento medido ultrapassou a margem direita. Páginas: início, login, cadastro, planos, catálogo, recuperação de senha e Sobre. |
| Termos e privacidade | O ambiente local devolveu 404 porque a identidade legal depende de configuração de ambiente. Essa resposta local foi excluída da contagem de páginas renderizadas. |

O Realme C55 foi a referência de classe de dispositivo. As medidas acima são larguras CSS de emulação. Não houve medição em hardware físico nem benchmark de CPU, memória e rede. Ainda faltam os fluxos completos com sessão de cliente, equipe, proprietário e administrador e dados representativos em celular e tablet.

## Segurança

| Achado | Correção |
| --- | --- |
| Permissões diretas por coluna na tabela Pix do estabelecimento | Removidas. A gravação pelo aplicativo usa a função que exige sessão financeira ativa do proprietário. |
| A chave de assinatura constava na leitura de configuração de contas autenticadas | A configuração de recebimento passou a exigir acesso master. A página da assinatura recebe somente um indicador de disponibilidade, além das informações comerciais já exibidas. |
| Destino de novas cobranças da vitrine e da assinatura | O banco confere chave, recebedor e cidade com a configuração correspondente. Bloqueia a criação em caso de divergência e registra o incidente no log técnico sem a chave. |
| Controle e rastreio | A guia Assinaturas do painel master mostra o estado, oferece suspensão e retomada e lista os 30 eventos recentes de mudança de destino ou de estado. O painel não exibe a chave no alerta. |
| Cabeçalhos HTTP | Adicionados controles para impedir enquadramento por sites de terceiros, restringir permissões do navegador e evitar detecção indevida de tipo de conteúdo. |

A suspensão atua sobre novas cobranças de assinatura, compras de vitrine, criação de cobrança em cartão e registros de confirmação cobertos pelos gatilhos, além de liquidações e recibos de comissão. Um QR Pix estático já entregue continua sujeito ao comportamento do banco recebedor. O controle do aplicativo não revoga esse código no sistema bancário. A trilha no painel mostra eventos concluídos. Tentativas rejeitadas por divergência aparecem no log do PostgreSQL, ainda sem alerta automático no painel. A credencial de banco compartilhada anteriormente deve ser rotacionada.

## Verificações de banco

- Migração executada no PostgreSQL local.
- Consultas de permissões retornaram falso para escrita direta de chave Pix pelo papel autenticado, leitura direta da chave de assinatura pelo mesmo papel e execução anônima do controle.
- Teste transacional confirmou gravação com a chave geral ativa, recusa durante a suspensão e nova gravação após a retomada. A transação de teste foi revertida.
- Resta validar a emissão, confirmação e conciliação reais com cada provedor e a matriz completa de isolamento de dados por papel.
