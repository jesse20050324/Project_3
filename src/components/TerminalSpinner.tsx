import { useEffect, useState } from "react";
import { useReducedMotion } from "../terminalMotion";

const frames = ["/", "|", "\\", "-"];

export function TerminalSpinner() {
  const reduced = useReducedMotion();
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const timer = window.setInterval(() => setFrame(value => (value + 1) % frames.length), 115);
    return () => window.clearInterval(timer);
  }, [reduced]);
  return <span className="terminal-spinner" aria-hidden="true">{reduced ? "-" : frames[frame]}</span>;
}
