"use client";

import { useEffect, useRef, useState } from "react";

type Appointment = { id: string; starts_at: string; service_name: string };
const noticeWindow = 5 * 60_000;

export function AppointmentReminder({ shop, appointments }: { shop: string; appointments: Appointment[] }) {
  const audio = useRef<AudioContext | null>(null);
  const delivered = useRef(new Set<string>());
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");

  async function enableSound() {
    try {
      audio.current ??= new AudioContext();
      await audio.current.resume();
      setEnabled(audio.current.state === "running");
    } catch {
      setMessage("O navegador não conseguiu ativar o som.");
    }
  }

  useEffect(() => () => { if (audio.current) void audio.current.close(); audio.current = null; }, []);

  useEffect(() => {
    if (!enabled) return;
    const check = () => {
      const context = audio.current;
      if (!context || context.state !== "running") return;
      const now = Date.now();
      const due = appointments.filter(({ id, starts_at }) => {
        // A agenda armazena os horários locais de São Paulo sem fuso no timestamp.
        const remaining = Date.parse(starts_at + "-03:00") - now;
        const key = `barberflow.reminder.${shop}.${id}.${starts_at}`;
        if (remaining <= 0 || remaining > noticeWindow || delivered.current.has(key)) return false;
        delivered.current.add(key);
        try {
          if (sessionStorage.getItem(key)) return false;
          sessionStorage.setItem(key, "1");
        } catch { /* A memória da página ainda evita repetições. */ }
        return true;
      });
      if (!due.length) return;
      setMessage(due.length === 1 ? `Atendimento próximo: ${due[0].service_name} às ${due[0].starts_at.slice(11,16)}.` : `${due.length} atendimentos começam nos próximos cinco minutos.`);
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
    <button className="secondary" type="button" onClick={enableSound} disabled={enabled}>
      {enabled ? "Lembretes sonoros ativos" : "Ativar lembretes sonoros"}
    </button>
    {message && <p role="status">{message}</p>}
  </div>;
}
