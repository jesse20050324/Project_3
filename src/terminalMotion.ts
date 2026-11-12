import { useEffect, useState } from "react";
import { RITUAL_MASK_MS } from "./engine/scheduler";
import type { Ritual } from "./engine/types";

export function ritualElapsed(ritual: Ritual, now: number) {
  if (ritual.startedAt !== undefined) return Math.max(0, now - ritual.startedAt);
  return ritual.phase === "pause" ? RITUAL_MASK_MS : Math.max(0, RITUAL_MASK_MS - (ritual.until - now));
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  return reduced;
}

export function useAnimationClock(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 48);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}
