"use client";

import { useEffect, useState } from "react";

type Notice = { text: string; kind: string };

export function ActionFeedback() {
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    let audio: AudioContext | undefined;
    let dismissed: ReturnType<typeof setTimeout> | undefined;
    let waitingForAudio = false;
    const heard = new WeakMap<Element,string>();
    const enableAudio = () => {
      try {
        audio ??= new AudioContext();
        if (audio.state === "suspended") void audio.resume().then(() => { if (waitingForAudio) play(); }).catch(() => {});
        else if (waitingForAudio) play();
      } catch { /* A notificação visual continua disponível. */ }
    };
    const play = () => {
      if (!audio || audio.state !== "running") { waitingForAudio = true; return; }
      waitingForAudio = false;
      const tone = audio.createOscillator();
      const gain = audio.createGain();
      const now = audio.currentTime;
      tone.frequency.setValueAtTime(590, now);
      tone.frequency.setValueAtTime(780, now + .1);
      gain.gain.setValueAtTime(.055, now);
      gain.gain.exponentialRampToValueAtTime(.001, now + .24);
      tone.connect(gain).connect(audio.destination);
      tone.start();
      tone.stop(now + .25);
    };
    const read = () => {
      const actionResult = ["estado","pagamento","vitrine"].some(key => new URLSearchParams(location.search).has(key));
      const selector = "main [data-feedback], main p[role=alert]" + (actionResult ? ", main p[role=status]:not([data-feedback-ignore])" : "");
      for (const node of document.querySelectorAll(selector)) {
        const text = node.textContent?.trim();
        if (!text || heard.get(node) === text || node.getClientRects().length === 0) continue;
        heard.set(node,text);
        const kind = node.getAttribute("data-feedback") ?? (node.getAttribute("role") === "alert" ? "warning" : "info");
        node.setAttribute("data-feedback", kind);
        setNotice({ text, kind });
        play();
        clearTimeout(dismissed);
        dismissed = setTimeout(() => { waitingForAudio = false; setNotice(null); }, 6500);
      }
    };
    const observer = new MutationObserver(read);
    observer.observe(document.querySelector("main") ?? document.body, { childList:true, subtree:true, characterData:true });
    document.addEventListener("pointerdown", enableAudio);
    document.addEventListener("keydown", enableAudio);
    read();
    return () => {
      observer.disconnect();
      document.removeEventListener("pointerdown", enableAudio);
      document.removeEventListener("keydown", enableAudio);
      clearTimeout(dismissed);
      if (audio) void audio.close().catch(() => {});
    };
  }, []);

  return notice && <aside className="action-feedback-toast" data-feedback={notice.kind}>
    <span aria-hidden="true">{notice.text}</span>
    <button type="button" aria-label="Fechar notificação" onClick={() => setNotice(null)}>×</button>
  </aside>;
}
