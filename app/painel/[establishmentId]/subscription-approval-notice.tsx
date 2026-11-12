"use client";

import { useEffect, useState, type ReactNode } from "react";

export function SubscriptionApprovalNotice({ id, children }: { id: string; children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const storageKey = "top-barber:subscription-approved:" + id;

  useEffect(() => {
    try { setVisible(localStorage.getItem(storageKey) !== "dismissed"); }
    catch { setVisible(true); }
  }, [storageKey]);

  if (!visible) return null;
  return <div data-feedback="success" className="subscription-approval-notice">
    <div role="status">{children}</div>
    <button type="button" aria-label="Fechar aviso de assinatura aprovada" onClick={() => {
      setVisible(false);
      try { localStorage.setItem(storageKey, "dismissed"); } catch { /* The notice still closes for this visit. */ }
    }}>×</button>
  </div>;
}
