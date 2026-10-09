import { useEffect, useMemo } from "react";
import chapterSource from "../content/chapter-01.yaml?raw";
import { loadBundledScript } from "./engine/loadScript";
import { Game } from "./Game";

export function App() {
  const loaded = useMemo(() => loadBundledScript(), [chapterSource]);

  useEffect(() => {
    if (loaded.error) console.error(loaded.error);
  }, [loaded]);

  if (!loaded.script) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center bg-[#e6e0d6] px-6 text-[#1c1915]">
        <p className="text-xs tracking-[0.16em] text-[#6b645b]">剧本不能开始</p>
        <h1 className="mt-2 text-xl">这份剧本还过不了检查</h1>
        <pre className="mt-4 whitespace-pre-wrap rounded-2xl bg-[#f7f4ee] p-4 text-sm leading-relaxed">{loaded.error}</pre>
      </main>
    );
  }

  return <Game script={loaded.script} />;
}
