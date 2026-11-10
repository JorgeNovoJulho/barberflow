import type { ReactNode } from "react";
import { PasswordField } from "../painel/[establishmentId]/financeiro/password-field";
import { SubmitButton } from "./submit";

const messages: Record<string, string> = {
  credenciais: "Confira o e-mail e a senha e tente novamente.",
  confirmar: "Cadastro recebido. Confira sua caixa de entrada e o spam. Confirme o e-mail antes de entrar.",
  email_pendente: "Esta conta ainda aguarda confirmação por e-mail. Abra o link que enviamos ou solicite outro abaixo.",
  reenviado: "Se houver uma confirmação pendente, você receberá um novo link por e-mail.",
  reenvio_falhou: "Não foi possível reenviar a confirmação agora. Tente novamente mais tarde.",
  limite: "Limite de tentativas atingido. Aguarde alguns minutos antes de tentar novamente.",
  termos: "Aceite os Termos de Uso e confirme a leitura da Política de Privacidade para continuar.",
  campos: "Preencha os campos obrigatórios para continuar.",
  senhas: "As duas senhas precisam ser iguais.",
  indisponivel: "A autenticação ainda não está configurada neste ambiente.",
  invalido: "Confira os campos. A senha precisa ter pelo menos oito caracteres, com letras e números.",
  google_desativado: "O cadastro com Google ainda não está disponível. Você pode criar sua conta com e-mail.",
  google: "Não foi possível continuar com o Google. Tente novamente ou use seu e-mail.",
  falha: "Não foi possível concluir a operação. Tente novamente.",
  enviado: "Se o endereço estiver cadastrado, enviaremos um link de redefinição.",
  link: "O link expirou ou não pôde ser validado.",
};

export function AccountForm({ title, description, status, action, submit, next, children, links, disabled, notice, before, alternateSubmit }: {
  title: string;
  description: string;
  status: string | undefined;
  action: (data: FormData) => Promise<void>;
  submit: string;
  next: string;
  children: ReactNode;
  links: ReactNode;
  disabled?: boolean;
  notice?: ReactNode;
  before?: ReactNode;
  alternateSubmit?: ReactNode;
}) {
  return <section className="container section">
    <div className="card account-card">
      <h1>{title}</h1><p>{description}</p>
      {status && Object.hasOwn(messages, status) && <p role="status">{messages[status]} {notice}</p>}
      {before}
      <form className="account-form" action={action}>
        <input type="hidden" name="next" value={next} />
        {children}
        <SubmitButton disabled={disabled}>{submit}</SubmitButton>
        {alternateSubmit}
      </form>
      <div className="account-links">{links}</div>
    </div>
  </section>;
}

export function Email() {
  return <label>E-mail <input name="email" type="email" autoComplete="email" required /></label>;
}

export function Password({ isNew = false, confirmation = false }: { isNew?: boolean; confirmation?: boolean }) {
  return <PasswordField label={confirmation ? "Confirmar senha" : "Senha"} name={confirmation ? "confirmation" : "password"}
    autoComplete={isNew ? "new-password" : "current-password"} minLength={isNew ? 8 : 1} maxLength={null} />;
}
