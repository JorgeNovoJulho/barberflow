import type { Metadata } from "next";
import { LegalDocument } from "../legal-document";

export const metadata: Metadata = { title: "Política de Privacidade" };

export default function PrivacyPage() {
  return <LegalDocument title="Política de Privacidade">
    <h2>Dados que usamos</h2>
    <p>Tratamos nome, e-mail, tipo de conta e dados técnicos de autenticação para criar e proteger sua conta. Se você usar recursos de agendamento ou compra, também tratamos os dados necessários para a operação, como telefone informado, serviço, data, estabelecimento, itens e situação do pagamento.</p>
    <p>Estabelecimentos podem cadastrar dados de clientes e profissionais, informações de agenda, fotos, contatos e registros financeiros. A plataforma exibe dados de perfil comercial conforme a configuração de publicação. Cadastros internos ficam nas áreas com acesso autorizado.</p>
    <h2>Para que usamos os dados</h2>
    <p>Usamos os dados para operar a conta, viabilizar reservas e compras, administrar assinaturas, atender solicitações e proteger o serviço. Conforme a finalidade, o tratamento pode decorrer da execução de contrato ou de procedimentos solicitados pelo usuário, do cumprimento de obrigações legais, do exercício regular de direitos ou de interesses legítimos avaliados para segurança e prevenção de fraude. Quando a operação depender de consentimento, ele será solicitado para a finalidade correspondente.</p>
    <h2>Compartilhamento</h2>
    <p>O estabelecimento recebe as informações necessárias para atender a reserva ou pedido. Usamos a Hostinger para hospedagem e o Supabase para autenticação, banco de dados e armazenamento. Quando o estabelecimento habilita um provedor de pagamentos, os dados necessários à cobrança são encaminhados ao provedor aplicável. Também podemos compartilhar informações quando houver obrigação legal ou solicitação válida de autoridade competente.</p>
    <h2>Dados cadastrados por estabelecimentos</h2>
    <p>O estabelecimento decide como usa os dados que coleta para o próprio atendimento e cadastro de clientes. Para questões sobre esse uso, procure o estabelecimento. Para questões sobre sua conta TOP BARBER e o funcionamento da plataforma, use o contato acima.</p>
    <h2>Sessão e conservação</h2>
    <p>Usamos cookies de autenticação para manter a sessão e controlar o acesso. Registramos o horário da última atividade em uma aba visível para que a administração possa acompanhar o estado recente de acesso da conta. Conservamos os dados pelo período necessário à finalidade de cada registro, considerando a duração da conta, o histórico necessário à prestação do serviço e obrigações legais ou contratuais de conservação.</p>
    <h2>Seus direitos</h2>
    <p>Você pode solicitar confirmação de tratamento, acesso, correção, informações sobre compartilhamento e, conforme o caso, portabilidade, anonimização, bloqueio ou eliminação. Também pode revogar consentimento quando ele for a base do tratamento ou apresentar oposição nos casos previstos na LGPD. Envie a solicitação ao contato indicado nesta página. Podemos pedir informações proporcionais para confirmar sua identidade.</p>
  </LegalDocument>;
}
