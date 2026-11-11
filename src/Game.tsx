import { useEffect, useState } from "react";
import { ChatPane } from "./components/ChatPane";
import { clearProgress } from "./engine/storage";
import type { Script } from "./engine/types";
import { useEngine } from "./useEngine";

type Props = { script: Script };

const CANVAS_W = 1440;
const CANVAS_H = 920;
const CHAPTER_LABEL: Record<number, string> = { 1: "一", 3: "三", 4: "四", 5: "五", 6: "六", 7: "七" };

function fitScale(): number {
  const width = window.innerWidth - 48;
  const height = window.innerHeight - 48;
  return Math.max(0.3, Math.min(1, width / CANVAS_W, height / CANVAS_H));
}

/** 固定尺寸画布，窗口不足时整块等比缩放；不重排、不做窄屏页签。 */
export function Game({ script }: Props) {
  const { state, dispatch, notice } = useEngine(script);
  const [scale, setScale] = useState(fitScale);
  const [askRestart, setAskRestart] = useState(false);

  useEffect(() => {
    const onResize = () => setScale(fitScale());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const chapter = Math.max(state.chapter.left, state.chapter.right);
  const chapterLabel = CHAPTER_LABEL[chapter] ?? String(chapter);

  function restart() {
    clearProgress();
    dispatch({ type: "reset" });
    setAskRestart(false);
  }

  return (
    <div className="stage">
      <div className="stage-frame" style={{ width: CANVAS_W * scale, height: CANVAS_H * scale }}>
        <div
          className="game-canvas"
          style={{ transform: `scale(${scale})`, opacity: askRestart ? 0.35 : 1 }}
          data-testid="game-canvas"
        >
          <header className="topbar">
            <span className="topbar-title" data-testid="chapter-title">He said, she said · 第{chapterLabel}幕</span>
            <span className="topbar-tag">助手 · 双会话</span>
            <span className="topbar-build" data-testid="build-version">v{__APP_VERSION__} · {__COMMIT__}</span>
            <div className="topbar-actions">
              <button
                type="button"
                className="topbar-act"
                data-testid="restart"
                onClick={() => setAskRestart(true)}
              >
                重新开始
              </button>
            </div>
          </header>

          {notice ? <div className="notice" role="status">{notice}</div> : null}
          {state.endings.includes("第七幕完成") ? <div className="notice" role="status">第七幕完成</div> : null}

          <div className="duo">
            <ChatPane script={script} channel="left" state={state} dispatch={dispatch} />
            <ChatPane script={script} channel="right" state={state} dispatch={dispatch} />
          </div>
        </div>
      </div>

      {askRestart ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="确定重来">
          <div className="dialog">
            <h2>确定重来？</h2>
            <p>当前两条线的进度都会清空，回到第一幕开头。</p>
            <div className="dialog-actions">
              <button type="button" className="btn ghost" onClick={() => setAskRestart(false)}>取消</button>
              <button type="button" className="btn danger" data-testid="restart-confirm" onClick={restart}>确定重来</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
