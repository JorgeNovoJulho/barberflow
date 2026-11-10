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

Mantenha a confirmação de e-mail habilitada no Supabase Auth. Após o cadastro
e a confirmação de `jorgericardosalgado@gmail.com`, o banco vincula o
identificador da conta ao painel master. Entre em `/gestao-master` com essa
conta. A gestão de assinaturas fica em `/gestao-master/assinaturas`.

## Atualização no GitHub

O repositório oficial é `JorgeNovoJulho/barberflow`. Para cada alteração,
confira o estado da branch remota, valide a compilação e o TypeScript, revise
o diff, faça um commit e envie a alteração ao GitHub. Inclua as migrações
necessárias para reproduzir o comportamento. As configurações reais ficam
em `.env.local`, e `.env.example` documenta os nomes das variáveis.

## Implantação web

1. No hPanel, adicione um aplicativo Node.js com suporte a Next.js. Importe
   `JorgeNovoJulho/barberflow`, branch `main`, pela integração do aplicativo
   Node.js. Use a raiz do repositório, Node.js 24 e o build `npm run build`.
2. Configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `BARBERFLOW_ORIGIN=https://topbarberflow.com.br`, `BARBERFLOW_TERMS_URL` e
   `BARBERFLOW_PRIVACY_URL` no ambiente da hospedagem. As duas últimas devem
   apontar para os documentos oficiais antes de habilitar o cadastro público.
   Desabilite `BARBERFLOW_LOCAL_TEST_SIGNUP` na hospedagem.
3. Em Supabase Auth → URL Configuration, configure o Site URL como
   `https://topbarberflow.com.br` e acrescente
   `https://topbarberflow.com.br/auth/callback` aos redirects permitidos.
   Mantenha os callbacks locais já usados para desenvolvimento.
4. Conecte `topbarberflow.com.br` ao aplicativo no hPanel. Use o IP informado
   para o aplicativo se a hospedagem solicitar a troca do registro A da raiz.
   Preserve o CNAME `www` e configure o redirecionamento para HTTPS sem `www`.
5. Teste login, confirmação e recuperação por e-mail, página pública,
   agendamento, upload e assinatura com contas dedicadas. Para testes de
   cartão, use as chaves de sandbox dos provedores.

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
é criptografado com essa chave. Selecione Asaas ou Mercado Pago por estabelecimento. Valide primeiro com uma conta de teste
do provedor. O checkout Asaas deste fluxo recebe crédito. Para débito, use Mercado Pago onde disponível. Depois de pagar no checkout, use Consultar
pagamento no provedor na comanda. Pagamentos de teste não baixam o caixa.
A conciliação compara a referência, a conta, a moeda, o valor e o meio de
pagamento. Estornos de cartões integrados devem ser tratados no provedor.

Para recuperação de senha iniciada pelo painel master, configure o modelo
**Reset password** do Supabase Auth com `supabase/templates/recovery.html`.
O modelo usa o hash de uso único, permitindo ao titular abrir o link em
outro navegador. A URL de retorno deve ser a mesma cadastrada no Auth.
Após ativar o SMTP e salvar o modelo, defina `BARBERFLOW_MASTER_RECOVERY_EMAILS=true`.
