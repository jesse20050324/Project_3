import { useEffect, useRef, useState } from "react";
import { ChatPane } from "./components/ChatPane";
import { TerminalArchive, type MemoryReplacement } from "./components/TerminalArchive";
import { TerminalFrame, type WorkspaceIntro } from "./components/TerminalFrame";
import { clearProgress } from "./engine/storage";
import { choiceMemoryGate, storyOutcome } from "./engine/scheduler";
import type { Channel, Script } from "./engine/types";
import { useAnimationClock, useReducedMotion } from "./terminalMotion";
import { useEngine } from "./useEngine";

const channels = ["left", "right"] as const;
type Cursor = { channel: Channel; beatId?: string; index: number };

export function Game({ script, onTitle, intro }: { script: Script; onTitle?: () => void; intro?: WorkspaceIntro }) {
  const running = !intro;
  const reduced = useReducedMotion();
  const { state, dispatch, notice } = useEngine(script, reduced, running);
  const outcome = storyOutcome(state);
  const [askRestart, setAskRestart] = useState(false);
  const [requestedReplacement, setReplacement] = useState<MemoryReplacement>();
  const replacement = requestedReplacement && !state.ritual[requestedReplacement.channel] && state.messages.some(
    message => message.channel === requestedReplacement.channel && message.beatId === requestedReplacement.entry.beatId,
  ) ? requestedReplacement : undefined;
  const [cursor, setCursor] = useState<Cursor>();
  const submitted = useRef<Partial<Record<Channel, string>>>({});
  const skipRefs = useRef<Partial<Record<Channel, () => void>>>({});
  const now = useAnimationClock(!reduced && Boolean(state.ritual.left || state.ritual.right));
  const active = channels.find(channel => state.pending[channel] && state.pending[channel]?.kind !== "choices")
    ?? channels.find(channel => state.pending[channel]?.kind === "choices");
  const focused = cursor?.channel ?? active ?? "left";

  function choicesFor(channel: Channel) {
    const pending = state.pending[channel];
    if (!pending || pending.kind !== "choices") return undefined;
    return script.beatById?.get(pending.beatId) ?? script.beats.find(beat => beat.id === pending.beatId);
  }
  function enabledFor(channel: Channel) {
    return choicesFor(channel)?.choices?.flatMap((choice, index) =>
      choiceMemoryGate(state, channel, choice) ? [] : [index]) ?? [];
  }
  function selected(channel: Channel) {
    if (focused !== channel) return -1;
    const options = enabledFor(channel);
    return cursor?.beatId === choicesFor(channel)?.id && options.includes(cursor?.index ?? -1)
      ? cursor!.index : options[0] ?? -1;
  }
  function moveTo(channel: Channel, index: number) {
    if (index >= 0 && !enabledFor(channel).includes(index)) return;
    setCursor({ channel, index, beatId: choicesFor(channel)?.id });
  }
  function pick(channel: Channel, index: number) {
    const beat = choicesFor(channel);
    if (!beat || !enabledFor(channel).includes(index) || askRestart) return;
    const key = `${state.runId}:${channel}:${beat.id}`;
    if (submitted.current[channel] === key) return;
    submitted.current[channel] = key;
    setCursor(undefined);
    dispatch({ type: "choose", channel, index });
  }

  useEffect(() => {
    function keyDown(event: KeyboardEvent) {
      if (!running || askRestart || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.defaultPrevented
        || document.querySelector('[role="dialog"]')) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("input,textarea,select,[contenteditable],.archive")) return;
      const choice = target?.closest<HTMLButtonElement>(".choice-line");
      if (target?.closest("button,a,summary") && !choice) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        moveTo(event.key === "ArrowLeft" ? "left" : "right", -1);
        choice?.blur();
      } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        const options = enabledFor(focused);
        if (!options.length) return;
        const index = options.indexOf(selected(focused));
        const step = event.key === "ArrowDown" ? 1 : -1;
        moveTo(focused, options[(index + step + options.length) % options.length]);
        choice?.blur();
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (event.repeat) return;
        const local = state.pending[focused];
        if (local?.kind === "lines" || local?.kind === "reply") {
          skipRefs.current[focused]?.();
          return;
        }
        const index = selected(focused);
        if (index >= 0) pick(focused, index);
        else if (!local) {
          const playing = channels.filter(channel => {
            const pending = state.pending[channel];
            return pending?.kind === "lines" || pending?.kind === "reply";
          });
          if (playing.length === 1) skipRefs.current[playing[0]]?.();
        }
      }
    }
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  });

  function restart() {
    clearProgress();
    dispatch({ type: "reset" });
    setCursor(undefined);
    setReplacement(undefined);
    setAskRestart(false);
  }

  return <TerminalFrame intro={intro}>
    <header className="topbar ascii-rule">
      <span className="topbar-title" data-testid="game-title">He said, she said</span>
      <span className="topbar-tag">助手 · 双会话</span>
      <div className="topbar-actions">
        <button type="button" data-testid="restart" onClick={() => setAskRestart(true)}>[重新开始]</button>
        {onTitle ? <button type="button" onClick={onTitle}>[返回标题]</button> : null}
      </div>
    </header>
    {notice ? <div className="notice" role="status">{notice}</div> : null}
    {outcome ? <div className="notice" role="status">
      {outcome === "未交换微信" ? "桌游局结束后，两人没有交换微信。" : `结局 · ${outcome}`}
    </div> : null}
    <div className="duo">
      {channels.map(channel => <ChatPane key={channel} script={script} channel={channel} state={state} dispatch={dispatch}
        active={Boolean(state.pending[channel])} focused={focused === channel} selected={selected(channel)}
        skipRefs={skipRefs} running={running} onMemoryFull={entry => setReplacement({ channel, entry })}
        onMove={index => moveTo(channel, index)} onPick={index => pick(channel, index)} now={now} reduced={reduced} />)}
      <TerminalArchive script={script} state={state} now={now} reduced={reduced} replacement={replacement}
        onCancelReplacement={() => setReplacement(undefined)}
        onReplace={label => {
          if (!replacement) return;
          dispatch({ type: "save-memory", channel: replacement.channel, ...replacement.entry, replaceLabel: label });
          setReplacement(undefined);
        }}
        onForget={(channel, label) => dispatch({ type: "forget-memory", channel, label })} />
    </div>
    {askRestart ? <div className="overlay" role="dialog" aria-modal="true" aria-label="确定重来">
      <div className="dialog">
        <h2>确定重来？</h2>
        <p>当前两条线的进度都会清空，回到第一幕开头。</p>
        <div className="dialog-actions">
          <button type="button" autoFocus onClick={() => setAskRestart(false)}>[取消]</button>
          <button type="button" data-testid="restart-confirm" onClick={restart}>[确定重来]</button>
        </div>
      </div>
    </div> : null}
  </TerminalFrame>;
}
