import { useCallback, useEffect, useMemo, useState } from "react";
import { loadBundledScript } from "./engine/loadScript";
import { TerminalMenu, TerminalStart } from "./components/TerminalStart";
import { clearProgress, hasProgress } from "./engine/storage";

export function App() {
  const loaded = useMemo(() => loadBundledScript(), []);
  const [page, setPage] = useState<"title" | "boot">("title");
  const [entry, setEntry] = useState<"new" | "resume">("new");
  const toTitle = useCallback(() => setPage("title"), []);
  const begin = useCallback((mode: "new" | "resume") => {
    if (mode === "new") clearProgress();
    setEntry(mode);
    setPage("boot");
  }, []);

  useEffect(() => {
    if (loaded.error) console.error(loaded.error);
  }, [loaded]);

  if (!loaded.script) {
    return (
      <main className="stage">
        <div className="dialog" style={{ width: 560 }}>
          <h2>这份剧本还过不了检查</h2>
          <p>引擎按字段契约逐项校验，下面是要修的地方：</p>
          <pre
            className="script-error"
            style={{ maxHeight: 420, whiteSpace: "pre-wrap", borderRadius: 12 }}
            data-testid="script-error"
          >
            {loaded.error}
          </pre>
        </div>
      </main>
    );
  }

  if (page === "title") return <TerminalMenu hasSave={hasProgress()} onBegin={begin} />;
  return <TerminalStart entry={entry} script={loaded.script} onTitle={toTitle} />;
}
