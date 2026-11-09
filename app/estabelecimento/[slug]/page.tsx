import { notFound } from "next/navigation";
import { publicProfile } from "../../../lib/public-booking";
import { ProfileView } from "./profile-view";

export default async function Establishment({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ denuncia?: string; vitrine?: string; produtos?: string }>;
}) {
  const { slug } = await params;
  const profile = await publicProfile(slug);
  if (!profile) notFound();
  const { denuncia, vitrine, produtos } = await searchParams;
  return <ProfileView profile={profile} denuncia={denuncia} vitrine={vitrine} produtos={produtos} />;
}
