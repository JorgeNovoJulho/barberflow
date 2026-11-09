"use client";

import type { ReactNode } from "react";

export function MobileNav({ children }: { children: ReactNode }) {
  return <details className="mobile-nav" onClick={(event) => {
    if (event.target instanceof Element && event.target.closest("a")) event.currentTarget.open = false;
  }}>
    <summary>Menu</summary>
    <nav aria-label="Principal">{children}</nav>
  </details>;
}
