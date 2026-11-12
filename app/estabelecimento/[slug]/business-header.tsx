import type { CSSProperties, ReactNode } from "react";
import { httpsUrl, publicProfileColor, readBusinessProfile } from "../../../lib/business-profile";

export function BusinessHeader({ name, city, details: raw, children }: {
  name: string; city: string; details: unknown; children?: ReactNode;
}) {
  const details = readBusinessProfile(raw);
  const color = publicProfileColor(details.color);
  const cover = httpsUrl(details.cover);
  const logo = httpsUrl(details.logo);
  return <header className={`public-business-profile${cover ? " has-cover" : ""}`}
    style={{ borderBlockStartColor: color, "--profile-color": color } as CSSProperties}>
    {cover && <img className="business-cover" src={cover} alt="" decoding="async" />}
    <div className="business-heading">
      {logo && <img className="business-logo" src={logo} alt={`Logotipo de ${name}`} />}
      <p className="eyebrow">{city}</p>
      <h1>{name}</h1>
      {children}
    </div>
  </header>;
}
