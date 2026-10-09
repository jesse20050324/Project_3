import { useEffect, useState } from "react";
import { ChatPane } from "./components/ChatPane";
import { DebugStrip } from "./components/DebugStrip";
import { messagesFor } from "./engine/scheduler";
import { clearProgress } from "./engine/storage";
import type { Channel, Script } from "./engine/types";
import { useEngine } from "./useEngine";

type Props = {
  script: Script;
};

export function Game({ script }: Props) {
  const { state, dispatch } = useEngine(script.beats);
  const [debug, setDebug] = useState(false);
  const [askRestart, setAskRestart] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [tab, setTab] = useState<Channel>("left");
  const narrow = useNarrow();
  const [seen, setSeen] = useState({ left: 0, right: 0 });
  const counts = {
    left: messagesFor(state, "left").length,
    right: messagesFor(state, "right").length,
  };

  useEffect(() => {
    if (!narrow) {
      setSeen(counts);
      return;
    }
    setSeen((prev) => ({ ...prev, [tab]: counts[tab] }));
  }, [narrow, tab, counts.left, counts.right]);

  function restart() {
    clearProgress();
    dispatch({ type: "reset" });
    setEpoch((value) => value + 1);
    setAskRestart(false);
    setTab("left");
    setSeen({ left: 0, right: 0 });
  }

  const tabs: Channel[] = ["left", "right"];

  return (
    <div className="h-dvh bg-[#e6e0d6] text-[#1c1915] md:p-4">
      <div className="mx-auto flex h-full max-w-[1120px] flex-col overflow-hidden bg-[#f6f3ed] md:rounded-2xl md:border md:border-[#ddd4c6] md:shadow-[0_18px_50px_rgba(60,40,20,0.08)]">
        <header className="flex items-center justify-between gap-3 border-b border-[#e4dcd0] px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] tracking-[0.18em] text-[#6b645b]">双线</p>
            <h1 className="truncate text-base font-medium">{script.title}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              data-testid="debug-toggle"
              aria-pressed={debug}
              onClick={() => setDebug((value) => !value)}
              className="rounded-full px-3 py-1 text-xs text-[#6b645b] hover:bg-[#efeae2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f5d54]"
            >
              调试
            </button>
            {askRestart ? (
              <>
                <button
                  type="button"
                  data-testid="restart-confirm"
                  onClick={restart}
                  className="rounded-full border border-[#2f5d54] px-3 py-1 text-xs text-[#2f5d54] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f5d54]"
                >
                  确定重来
                </button>
                <button
                  type="button"
                  onClick={() => setAskRestart(false)}
                  className="rounded-full px-3 py-1 text-xs text-[#6b645b] hover:bg-[#efeae2]"
                >
                  取消
                </button>
              </>
            ) : (
              <button
                type="button"
                data-testid="restart"
                onClick={() => setAskRestart(true)}
                className="rounded-full px-3 py-1 text-xs text-[#6b645b] hover:bg-[#efeae2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f5d54]"
              >
                重新开始
              </button>
            )}
          </div>
        </header>
        <div role="tablist" aria-label="选择一条对话" className="grid grid-cols-2 gap-1 border-b border-[#e4dcd0] p-2 md:hidden">
          {tabs.map((channel) => {
            const person = script.speakers.find((speaker) => speaker.channel === channel);
            const active = tab === channel;
            const unread = counts[channel] > seen[channel] && tab !== channel;
            return (
              <button
                key={channel}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`tab-${channel}`}
                onClick={() => setTab(channel)}
                className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  active ? "bg-white text-[#1c1915] shadow-sm" : "text-[#6b645b]"
                }`}
              >
                {person?.name ?? channel}
                {unread ? (
                  <span data-testid={`unread-${channel}`} className="inline-block h-1.5 w-1.5 rounded-full bg-[#2f5d54]" aria-label="有新消息" />
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2 md:divide-x md:divide-[#e4dcd0]">
          <ChatPane
            key={`left-${epoch}`}
            script={script}
            channel="left"
            state={state}
            dispatch={dispatch}
            hidden={narrow && tab !== "left"}
          />
          <ChatPane
            key={`right-${epoch}`}
            script={script}
            channel="right"
            state={state}
            dispatch={dispatch}
            hidden={narrow && tab !== "right"}
          />
        </div>
        {debug ? <DebugStrip script={script} state={state} /> : null}
      </div>
    </div>
  );
}

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 767px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const onChange = () => setNarrow(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return narrow;
}
