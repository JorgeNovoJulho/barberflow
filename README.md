# BARBERFLOW

Plataforma de agendamento e gestão para negócios e profissionais de beleza e
bem-estar. Atende ao escopo de salões, barbearias, esmalterias, estética,
manicure, trancistas, massoterapia, estúdios de tatuagem e piercing e clínicas
de bronzeamento.

## Desenvolvimento

Use Node.js 24 e instale as dependências com `npm ci`. Rode `npm run dev` e abra
`http://localhost:3000`. Para verificar o projeto, rode `npm run build` e
`npm run typecheck`.

## Autenticação e preferências

Copie `.env.example` para `.env.local` e preencha a URL e a chave publicável
do Supabase. Configure `BARBERFLOW_ORIGIN` com a URL canônica do ambiente.
Na configuração de Auth do Supabase, permita o retorno pelo caminho
`/auth/callback` dessa origem, inclusive em localhost para testes.

O cadastro fica disponível quando `BARBERFLOW_TERMS_URL` e
`BARBERFLOW_PRIVACY_URL` apontam para os documentos do BARBERFLOW. Aplique as
migrações em `supabase/migrations` em ordem pelo prefixo numérico. Em um banco
já provisionado, aplique somente as migrações pendentes. Teste com contas
dedicadas. A senha PostgreSQL é uma credencial de administração e fica fora
do ambiente do aplicativo.

## Módulos

- Catálogo público, perfis de estabelecimentos, avaliações e agendamento online.
- Painel de agenda, clientes, equipe, serviços, fidelidade e notificações.
- Estoque com mídias, produtos em comandas e controle financeiro com relatórios,
  fechamentos, comissões e exportação CSV.
- Assinaturas com teste para novos estabelecimentos e confirmação manual de
  pagamentos, além da gestão master de conteúdo, avaliações e assinaturas.

O painel master exige uma conta confirmada e cadastrada no banco como master.
Em uma instalação nova, a migração de administração registra a conta
autorizada se ela já existir e estiver confirmada. Caso a conta seja criada
depois, o administrador do banco precisa cadastrá-la na tabela privada
`barberflow_private.master_account`.

## Atualização no GitHub

O repositório oficial é `JorgeNovoJulho/barberflow`. Para cada alteração,
confira o estado da branch remota, valide a compilação e o TypeScript, revise
o diff, faça um commit e envie a alteração ao GitHub. Inclua as migrações
necessárias para reproduzir o comportamento. As configurações reais ficam
em `.env.local`, e `.env.example` documenta os nomes das variáveis.

## Implantação web

O domínio previsto para produção é `topbarberflow.com.br`. Na implantação,
configure o DNS no provedor de hospedagem, use
`BARBERFLOW_ORIGIN=https://topbarberflow.com.br` e autorize
`https://topbarberflow.com.br/auth/callback` no Supabase Auth.

## Atualização local no Windows

Use PowerShell 7 e execute npm run release:local para recompilar e trocar a
versão servida na porta 3000. A compilação ocorre em uma pasta separada.
Arquivos estáticos da versão anterior continuam disponíveis para abas já
abertas. A troca só é aceita após a verificação da página inicial e de seu CSS.
Para migrar um servidor BARBERFLOW já iniciado manualmente, confira quem está
usando a porta e execute npm run release:local -- -ReplaceLegacy uma vez.

## Recebimentos de estabelecimentos

Em Financeiro, desbloqueie a sessão e abra Configurar Pix e cartões. A conta
Pix é compartilhada pela vitrine e pelas comandas. A comanda fechada gera QR
e Pix Copia e Cola com o saldo pendente. Registre o crédito após a conferência
do extrato.

Para cartões, configure SUPABASE_SERVICE_ROLE_KEY e BARBERFLOW_PAYMENT_SECRET
somente no servidor. Gere a segunda variável com
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
e preserve a chave entre implantações. O Access Token informado no painel
é criptografado com essa chave. Valide primeiro com uma conta de teste
brasileira do Mercado Pago. Depois de pagar no checkout, use Consultar
pagamento no Mercado Pago na comanda. Pagamentos de teste não baixam o caixa.
A conciliação compara a referência, a conta, a moeda, o valor e o meio de
pagamento. Estornos de cartões integrados devem ser tratados no provedor.
