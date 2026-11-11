"use client";

import { useEffect, useRef, useState } from "react";

type Appointment = { id: string; starts_at: string; service_name: string };
const noticeWindow = 5 * 60_000;

export function AppointmentReminder({ shop, appointments }: { shop: string; appointments: Appointment[] }) {
  const audio = useRef<AudioContext | null>(null);
  const delivered = useRef(new Set<string>());
  const [enabled, setEnabled] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!enabled) return;
    const unlock = () => {
      try {
        audio.current ??= new AudioContext();
        void audio.current.resume().catch(() => setMessage("O navegador não conseguiu ativar o som."));
      } catch {
        setMessage("O navegador não conseguiu ativar o som.");
      }
    };
    window.addEventListener("pointerup", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerup", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [enabled]);

  useEffect(() => () => { if (audio.current) void audio.current.close(); audio.current = null; }, []);

  useEffect(() => {
    if (!enabled) return;
    const check = () => {
      const context = audio.current;
      if (!context || context.state !== "running") return;
      const now = Date.now();
      const due = appointments.filter(({ id, starts_at }) => {
        // A agenda armazena os horÃ¡rios locais de SÃ£o Paulo sem fuso no timestamp.
        const remaining = Date.parse(starts_at + "-03:00") - now;
        const key = `barberflow.reminder.${shop}.${id}.${starts_at}`;
        if (remaining <= 0 || remaining > noticeWindow || delivered.current.has(key)) return false;
        delivered.current.add(key);
        try {
          if (sessionStorage.getItem(key)) return false;
          sessionStorage.setItem(key, "1");
        } catch { /* A memÃ³ria da pÃ¡gina ainda evita repetiÃ§Ãµes. */ }
        return true;
      });
      if (!due.length) return;
      setMessage(due.length === 1 ? `Atendimento prÃ³ximo: ${due[0].service_name} Ã s ${due[0].starts_at.slice(11,16)}.` : `${due.length} atendimentos comeÃ§am nos prÃ³ximos cinco minutos.`);
      const tone = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime;
      tone.frequency.value = 660;
      gain.gain.value = 0;
      for (let second = 0; second < 5; second++) {
        gain.gain.setValueAtTime(.08, start + second);
        gain.gain.linearRampToValueAtTime(0, start + second + .65);
      }
      tone.connect(gain).connect(context.destination);
      tone.onended = () => { tone.disconnect(); gain.disconnect(); };
      tone.start(start);
      tone.stop(start + 5);
    };
    check();
    const timer = window.setInterval(check, 1_000);
    return () => window.clearInterval(timer);
  }, [appointments, enabled, shop]);

  return <div className="account-links">
    <button className="secondary reminder-toggle" type="button" aria-pressed={enabled} onClick={() => setEnabled(!enabled)}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M3 9v6h4l5 4V5L7 9H3Z"/>
        {enabled ? <path d="M16 9a4 4 0 0 1 0 6m2-9a8 8 0 0 1 0 12"/> : <path d="m16 10 5 5m0-5-5 5"/>}
      </svg>
      Lembretes sonoros
    </button>
    {message && <p role="status">{message}</p>}
  </div>;
}
