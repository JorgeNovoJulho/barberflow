import { mediaLinks } from "../../cliente/social";
import { supabaseServer } from "../../../lib/supabase";
import { SubmitButton } from "../../auth/submit";
import { cancelAppointment } from "./cancel-appointment";

export async function appointmentAvatars(supabase: NonNullable<Awaited<ReturnType<typeof supabaseServer>>>, entries: { id: string; booked_by: string | null }[]) {
  const accounts = [...new Set(entries.flatMap(({ booked_by }) => booked_by ? [booked_by] : []))];
  if (!accounts.length) return new Map<string, string | undefined>();
  const { data } = await supabase.from("barberflow_social_profiles").select("user_id,avatar").in("user_id", accounts);
  const avatars = new Map((data ?? []).map(({ user_id, avatar }) => [user_id, avatar]));
  const links = await mediaLinks(supabase, [...avatars.values()]);
  return new Map(entries.map(({ id, booked_by }) => [id, links.get(avatars.get(booked_by) ?? "")]));
}

export function ClientAvatar({ photo }: { photo?: string }) {
  return photo ? <img className="booking-client-avatar" src={photo} width={36} height={36} alt="" loading="lazy" />
    : <svg className="booking-client-avatar" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="8" r="3"/><path d="M5 20v-2a7 7 0 0 1 14 0v2"/></svg>;
}

export function CancelAppointmentForm({ shop, entry, day, overview = false }: { shop: string; entry: string; day: string; overview?: boolean }) {
  return <details className="booking-cancel">
    <summary className="secondary action-cancel">Cancelar agendamento</summary>
    <form className="account-form" action={cancelAppointment.bind(null, shop, entry, day, overview)}>
      <label>Motivo do cancelamento<textarea name="reason" rows={3} required maxLength={500} /></label>
      <SubmitButton tone="cancel">Confirmar cancelamento</SubmitButton>
    </form>
  </details>;
}

export function CancellationFeedback({ state }: { state?: string }) {
  if (!state) return null;
  return state === "confirmado"
    ? <p role="status" data-feedback="success">Agendamento cancelado. O horário foi liberado na agenda.</p>
    : <p role="alert" data-feedback="warning">Não foi possível cancelar. Confira o motivo e se o agendamento ainda está ativo.</p>;
}
