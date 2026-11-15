import { useCallback, useEffect, useMemo, useState } from "react";
import { LanguageContext, useLanguage, type Language } from "./language";
import { loadBundledScript } from "./engine/loadScript";
import { TerminalMenu, TerminalStart } from "./components/TerminalStart";
import { unlockSound } from "./audio/gameSound";
import { clearProgress, hasProgress } from "./engine/storage";

export function App() {
  const [language, setLanguage] = useState<Language>(() => {
    try { return localStorage.getItem("shuangxian.language") === "zh" ? "zh" : "en"; }
    catch { return "en"; }
  });
  useEffect(() => {
    document.documentElement.lang = language === "en" ? "en" : "zh-CN";
    try { localStorage.setItem("shuangxian.language", language); } catch { /* storage may be unavailable */ }
  }, [language]);
  return <LanguageContext.Provider value={{ language, setLanguage }}><LocalizedApp /></LanguageContext.Provider>;
}

function LocalizedApp() {
  const { t } = useLanguage();
  const loaded = useMemo(() => loadBundledScript(), []);
  const [page, setPage] = useState<"title" | "boot">("title");
  const [entry, setEntry] = useState<"new" | "resume">("new");
  const toTitle = useCallback(() => setPage("title"), []);
  const begin = useCallback((mode: "new" | "resume") => {
    unlockSound();
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
          <h2>{t("这份剧本还过不了检查", "The story failed validation")}</h2>
          <p>{t("引擎按字段契约逐项校验，下面是要修的地方：", "The game could not load the story.")}</p>
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
