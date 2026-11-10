import type { ReactNode } from "react";
import Link from "next/link";

const icons = {
  services: "M6 4h12v16H6zM9 8h6m-6 4h6m-6 4h3",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v5m8-5v5",
  posts: "M4 4h16v16H4zM4 16l5-5 4 4 2-2 5 5M15 8h.01",
  follow: "M12 5v14M5 12h14",
  unfollow: "m5 12 4 4L19 6",
  favorite: "M12 20l-7-7a5 5 0 0 1 7-7 5 5 0 0 1 7 7z",
};

export function DirectoryAction({ kind, label, href, action, pressed }: {
  kind: keyof typeof icons; label: string; href?: string; action?: () => Promise<void>; pressed?: boolean;
}) {
  const content: ReactNode = <>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icons[kind]} /></svg>
    <span>{label}</span>
  </>;
  const style = "directory-action directory-action-" + kind;
  return href ? <Link className={style} href={href} aria-label={label} title={label} data-tip={label}>{content}</Link>
    : <form action={action}><button className={style} aria-pressed={pressed} aria-label={label} title={label} data-tip={label}>{content}</button></form>;
}
