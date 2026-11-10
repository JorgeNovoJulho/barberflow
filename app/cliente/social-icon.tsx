const paths: Record<string,string> = {
  Facebook: "M14 21v-8h3l.5-3H14V8c0-1 .3-2 2-2h2V3h-3c-3 0-5 2-5 5v2H7v3h3v8z",
  YouTube: "M21 8c-.2-1.5-1-2-2.5-2.2a79 79 0 0 0-13 0C4 6 3.2 6.5 3 8a25 25 0 0 0 0 8c.2 1.5 1 2 2.5 2.2a79 79 0 0 0 13 0C20 18 20.8 17.5 21 16a25 25 0 0 0 0-8ZM10 9l5 3-5 3Z",
  TikTok: "M14 3h3c.4 2.1 1.8 3.5 4 4v3c-1.6-.1-2.9-.6-4-1.5V16a5 5 0 1 1-5-5v3a2 2 0 1 0 2 2z",
};

export function SocialIcon({ name }: { name: string }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
    {name === "Instagram" ? <g fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M17.5 6.5h.01" strokeLinecap="round" /></g>
      : <path d={paths[name]} fill="currentColor" fillRule="evenodd" />}
  </svg>;
}
