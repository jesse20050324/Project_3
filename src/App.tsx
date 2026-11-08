import { useEffect, useMemo } from "react";
import { loadBundledScript } from "./engine/loadScript";
import { Game } from "./Game";

export function App() {
  const loaded = useMemo(() => loadBundledScript(), []);

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

  return <Game script={loaded.script} />;
}
