import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "../legal-document";

export const metadata: Metadata = { title: "Termos de Uso" };

export default function TermsPage() {
  return <LegalDocument title="Termos de Uso">
    <h2>Uso da plataforma</h2>
    <p>O TOP BARBER permite que negócios de beleza e bem-estar publiquem seus perfis, organizem serviços e gerenciem seus atendimentos. Clientes podem consultar estabelecimentos, agendar serviços e, quando disponível, comprar produtos.</p>
    <h2>Conta e acesso</h2>
    <p>Informe dados corretos, mantenha seu e-mail atualizado e proteja suas credenciais. Avise o suporte se identificar acesso indevido. O acesso de equipe deve ser concedido somente às pessoas autorizadas pelo estabelecimento.</p>
    <h2>Serviços, produtos e reservas</h2>
    <p>Cada estabelecimento é responsável pelas informações que publica, pelos preços, pelos horários e pelo atendimento ou fornecimento contratado. Consulte o estabelecimento para esclarecer condições de pagamento, retirada, cancelamento e remarcação. As regras configuradas no perfil se aplicam às reservas, respeitados os direitos previstos em lei.</p>
    <h2>Planos e cobranças</h2>
    <p>Os preços, as modalidades e a situação da assinatura do estabelecimento aparecem na página de planos e no painel. Para pagamentos por Pix sujeitos a conferência, a vigência é atualizada após a confirmação do recebimento. Consulte o painel para conferir o período contratado e as opções de renovação.</p>
    <h2>Conteúdo e conduta</h2>
    <p>Publique apenas conteúdo que você tenha direito de usar. Não use a plataforma para fraude, spam, exposição indevida de dados, violação de direitos ou tentativas de acessar contas de terceiros. A plataforma pode remover conteúdo ou restringir acesso em caso de abuso ou risco à segurança.</p>
    <h2>Suporte e privacidade</h2>
    <p>Use o contato indicado nesta página para questões relacionadas à conta ou à plataforma. Saiba como tratamos dados pessoais na <Link href="/politica-de-privacidade">Política de Privacidade</Link>.</p>
  </LegalDocument>;
}
