const paths = {
  feed: "M4 5h16v14H4zM7 9h10M7 13h10M7 16h6",
  dashboard: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  person: "M8 8a4 4 0 1 0 8 0 4 4 0 0 0-8 0ZM4 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2",
  bell: "M5 17h14l-2-3V9A5 5 0 0 0 7 9v5zM10 21h4",
  search: "M4 10a6 6 0 1 0 12 0 6 6 0 0 0-12 0Zm10 5 6 6",
  shop: "M4 9h16l-2-5H6zM5 9v11h14V9m-9 11v-6h4v6",
  following: "M4 12l5 5L20 6",
  star: "m12 3 3 6 7 1-5 5 1 6-6-3-6 3 1-6-5-5 7-1z",
  calendar: "M4 5h16v15H4zM4 9h16M8 3v4m8-4v4",
  bag: "M5 7h14l2 14H3zM9 9V6a3 3 0 0 1 6 0v3",
  exit: "M10 4H4v16h6m3-8h8m-4-4 4 4-4 4",
};

export function FeedIcon({ name }: { name: keyof typeof paths }) {
  return <svg className="workspace-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
