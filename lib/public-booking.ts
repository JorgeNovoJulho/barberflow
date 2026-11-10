import { supabaseServer } from "./supabase";
import type { ServiceMediaPaths } from "./service-media";

export const slugPattern = /^(?=.{3,80}$)[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type PublicProfile = {
  slug: string;
  name: string;
  city: string;
  segment: string;
  description: string;
  details?: unknown;
  services: (ServiceMediaPaths & {
    id: string; name: string; description: string; category: string; price_cents: number; duration_minutes: number;
    professionals: { id: string; name: string; photo_url?: string }[];
  })[];
};

export async function publicProfile(slug: string) {
  if (!slugPattern.test(slug)) return null;
  const supabase = await supabaseServer();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("barberflow_public_profile", { profile_slug: slug });
  if (error) throw new Error("Não foi possível carregar o estabelecimento.");
  return data as PublicProfile | null;
}

export { bookingCurrency } from "./currency";
