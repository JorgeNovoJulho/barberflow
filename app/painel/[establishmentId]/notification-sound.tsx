"use client";

import { useEffect, useRef } from "react";

type NoticeBatch = { asOf: string; items: { id: string; created: string }[] };

export function NotificationSound({ batch }: { batch: NoticeBatch | null }) {
  const startedAt = useRef<string | null>(null);
  const seen = useRef(new Set<string>());
  const audio = useRef<AudioContext | null>(null);
  const pending = useRef(0);
  const nextStart = useRef(0);

  function play() {
    const context = audio.current;
    if (!context || context.state !== "running" || !pending.current) return;
    let start = Math.max(context.currentTime + .02, nextStart.current);
    for (let index = 0; index < pending.current; index++) {
      for (const [offset, frequency] of [[0, 660], [.2, 880], [.4, 1046]]) {
        const tone = context.createOscillator();
        const gain = context.createGain();
        const at = start + offset;
        tone.frequency.value = frequency;
        gain.gain.setValueAtTime(.001, at);
        gain.gain.exponentialRampToValueAtTime(.18, at + .025);
        gain.gain.exponentialRampToValueAtTime(.001, at + .18);
        tone.connect(gain).connect(context.destination);
        tone.onended = () => { tone.disconnect(); gain.disconnect(); };
        tone.start(at);
        tone.stop(at + .19);
      }
      start += .85;
    }
    nextStart.current = start;
    pending.current = 0;
  }

  useEffect(() => {
    const unlock = () => {
      try {
        audio.current ??= new AudioContext();
        void audio.current.resume().then(play).catch(() => {});
      } catch { /* O navegador mantém o aviso visual. */ }
    };
    window.addEventListener("pointerup", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerup", unlock);
      window.removeEventListener("keydown", unlock);
      if (audio.current) void audio.current.close().catch(() => {});
      audio.current = null;
      nextStart.current = 0;
    };
  }, []);

  useEffect(() => {
    if (!batch) return;
    startedAt.current ??= batch.asOf;
    for (const { id, created } of batch.items) {
      if (Date.parse(created) <= Date.parse(startedAt.current) || seen.current.has(id)) continue;
      seen.current.add(id);
      pending.current++;
    }
    play();
  }, [batch]);

  return null;
}
