import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

const width = 1440;
const height = 920;

function fitScale() {
  const margin = window.innerWidth < 720 ? 12 : 40;
  return Math.min(1, Math.max(1, window.innerWidth - margin) / width, Math.max(1, window.innerHeight - margin) / height);
}

export type WorkspaceIntro = { header: number; dividers: number; left: number; right: number; archive: number };

export function TerminalFrame({ children, intro }: { children: ReactNode; intro?: WorkspaceIntro }) {
  const [scale, setScale] = useState(fitScale);
  useEffect(() => {
    const resize = () => setScale(fitScale());
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  return <main className="stage">
    <div className="stage-frame" style={{ width: width * scale, height: height * scale }}>
      <div className="game-canvas" data-testid="game-canvas" data-intro={intro ? true : undefined} inert={Boolean(intro)}
        style={{
          transform: `scale(${scale})`,
          ...(intro ? Object.fromEntries(Object.entries(intro).map(([key, value]) => [`--intro-${key}`, `${value}%`])) : {}),
        } as CSSProperties}>
        {children}
      </div>
    </div>
  </main>;
}
