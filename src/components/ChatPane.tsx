import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { englishBeats, messageText, useLanguage } from "../language";
import { channelView, choiceMemoryGate, memoryCapacity, messagesFor, RITUAL_MASK_MS } from "../engine/scheduler";
import { ritualElapsed } from "../terminalMotion";
import { TerminalSpinner } from "./TerminalSpinner";
import { ProgressiveText } from "./ProgressiveText";
import { terminalUsers } from "../terminalIdentity";
import type { Action } from "../engine/reducer";
import type {
  Channel, Delivery, EngineState, MemoryCandidate, MemoryEntry, Script, Timing,
} from "../engine/types";
import { DEFAULT_PACING, PACING, playbackGapMs, resolveTiming, shouldType, ZERO_TIMING } from "../presentation";
import { ChoicePanel, type ComposerMode } from "./ChoicePanel";

import { MessageBubble, type MemoryMark } from "./MessageBubble";

type Props = {
  script: Script;
  channel: Channel;
  state: EngineState;
  dispatch: (action: Action) => void;
  active: boolean;
  focused: boolean;
  selected: number;
  skipRefs: RefObject<Partial<Record<Channel, () => void>>>;
  onMove: (index: number) => void;
  onPick: (index: number) => void;
  now: number;
  reduced: boolean;
  running: boolean;
  onMemoryFull: (entry: MemoryEntry) => void;
};

type Outgoing = {
  token: string;
  id: string;
  beatId: string;
  from: string;
  text: string;
  delivery: Delivery;
  caption?: string;
  timing: Timing;
};

type Phase = "idle" | "pause" | "indicator" | "typing" | "shown";

export function ChatPane({
  script, channel, state, dispatch, active, focused, selected, skipRefs, onMove, onPick, now, reduced, running, onMemoryFull,
}: Props) {
  const { language, t } = useLanguage();
  const { name, id } = terminalUsers[channel];
  const title = t(name, channel === "left" ? "Him" : "Her");
  const display = (message: Parameters<typeof messageText>[0]) =>
    language === "en" ? messageText(message) : message.text;
  const markText = (beatId: string, candidate: MemoryCandidate) => language === "en"
    ? englishBeats[beatId]?.memories.find(item => item.label === candidate.缩略标签)?.quote[1] ?? candidate.短句
    : candidate.短句;
  const pending = state.pending[channel];
  const messages = messagesFor(state, channel);
  const visibleMessages = messages.filter((message) => message.delivery !== "thought");
  const thought = pending?.kind === "choices"
    ? [...messages].reverse().find(message => message.beatId === pending.beatId && message.delivery === "thought")
    : null;
  const view = channelView(state, channel, script.beats);
  const ritual = state.ritual[channel];
  const elapsed = ritual ? ritualElapsed(ritual, now) : 0;
  const dropped = ritual ? ritual.phase === "pause" || reduced
    ? visibleMessages.length
    : Math.floor(visibleMessages.length * Math.min(1, elapsed / RITUAL_MASK_MS)) : 0;
  const displayed = visibleMessages.slice(dropped);

  const beatOf = (beatId: string) => script.beatById?.get(beatId) ?? script.beats.find((beat) => beat.id === beatId);
  const savedLabels = new Set(state.memories[channel].map((memory) => memory.label));
  const marksFor = (beatId: string, text: string): MemoryMark[] => {
    const candidates: MemoryCandidate[] = beatOf(beatId)?.记忆候选 ?? [];
    return candidates
      .filter((candidate) => text.includes(candidate.短句))
      .map((candidate) => ({ text: markText(beatId, candidate), saved: savedLabels.has(candidate.缩略标签) }));
  };
  const memorySaved = state.memories[channel].length;
  const capacity = memoryCapacity(state, channel);

  const [showMemoryCount, setShowMemoryCount] = useState(false);
  const memoryCounter = useRef<HTMLButtonElement>(null);
  const [playback, setPlayback] = useState<{ token: string; phase: Phase }>();
  const original = running ? resolveOutgoing(script, state, channel) : null;
  const translated = original ? display(original) : "";
  const outgoing = original && {
    ...original,
    text: translated,
    timing: { ...original.timing, typeIntervalMs: original.timing.typeIntervalMs
      * original.text.length / Math.max(1, translated.length) },
  };
  const token = outgoing?.token ?? "";
  const phase = playback?.token === token ? playback.phase : "idle";
  const commitRef = useRef<() => void>(() => {});
  const stateRef = useRef(state);
  const doneToken = useRef<string | null>(null);
  const timers = useRef<number[]>([]);
  const afterMsRef = useRef(0);
  const finishedAt = useRef<number | undefined>(undefined);
  const lastPlayback = useRef<{ runId: EngineState["runId"]; beatId: string; finishedAt: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const rowPositions = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (!ritual || reduced) {
      rowPositions.current.clear();
      return;
    }
    el.scrollTop = 0;
    const next = new Map<string, number>();
    for (const row of el.querySelectorAll<HTMLElement>("[data-clear-row]")) {
      const key = row.dataset.clearRow!;
      const top = row.offsetTop;
      const previous = rowPositions.current.get(key);
      next.set(key, top);
      if (previous !== undefined && previous !== top) {
        row.animate?.([{ transform: `translateY(${previous - top}px)` }, { transform: "translateY(0)" }],
          { duration: 135, easing: "ease-out" });
      }
    }
    rowPositions.current = next;
  }, [ritual, dropped, reduced]);
  stateRef.current = state;

  const clearTimers = useCallback(() => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    if (ms <= 0) {
      fn();
      return;
    }
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  const commit = useCallback(() => {
    clearTimers();
    const current = stateRef.current.pending[channel];
    if (!current || current.kind === "choices") return;
    const currentToken = `${stateRef.current.runId}|${current.beatId}:${current.kind}:${"lineIndex" in current ? current.lineIndex : "choiceIndex" in current ? current.choiceIndex : 0}`;
    if (doneToken.current === currentToken) return;
    doneToken.current = currentToken;
    lastPlayback.current = {
      runId: stateRef.current.runId,
      beatId: current.beatId,
      finishedAt: finishedAt.current ?? performance.now(),
    };
    dispatch(current.kind === "lines" ? { type: "commit-line", channel } : { type: "commit-reply", channel });
  }, [channel, clearTimers, dispatch]);
  commitRef.current = commit;

  const finishTyping = useCallback(() => {
    finishedAt.current = performance.now();
    later(() => commitRef.current(), afterMsRef.current);
  }, [later]);

  const skip = useCallback(() => commitRef.current(), []);
  useEffect(() => {
    const refs = skipRefs.current;
    refs[channel] = skip;
    return () => { delete refs[channel]; };
  }, [channel, skip, skipRefs]);

  // 一次消息 = pauseBefore（停顿感）→ indicator（三点）→ 逐字/整条 → afterMs（留白）→ commit。
  // 自动接续补足段内或跨虚线的留白，已读完后的停顿和等待对窗的时间都计入。
  useEffect(() => {
    clearTimers();
    const setPhase = (phase: Phase) => setPlayback({ token, phase });
    if (!outgoing) {
      setPhase("idle");
      return clearTimers;
    }

    const timing = reduced ? { ...ZERO_TIMING } : outgoing.timing;
    const previous = lastPlayback.current;
    const current = stateRef.current;
    const isReply = current.pending[channel]?.kind === "reply";
    let pauseBeforeMs = isReply ? 0 : timing.pauseBeforeMs;
    if (!reduced && !isReply && previous?.runId === current.runId) {
      const gap = playbackGapMs(beatOf(previous.beatId)?.context, beatOf(outgoing.beatId)?.context);
      if (gap > 0) {
        const deliberatePause = timing.pauseBeforeMs > PACING[DEFAULT_PACING].pauseBeforeMs ? timing.pauseBeforeMs : 0;
        pauseBeforeMs = Math.max(deliberatePause, gap - (performance.now() - previous.finishedAt));
      }
    }
    finishedAt.current = undefined;
    afterMsRef.current = outgoing.delivery === "thought" ? 0 : timing.afterMs;
    setPhase("pause");
    later(() => {
      setPhase("indicator");
      later(() => {
        if ((!reduced && outgoing.delivery === "thought") || shouldType(outgoing.delivery, reduced)) {
          setPhase("typing");
        } else {
          setPhase("shown");
          finishTyping();
        }
      }, timing.indicatorMs);
    }, pauseBeforeMs);
    return clearTimers;
  }, [token, channel, clearTimers, finishTyping, later, outgoing?.delivery, reduced]);

  useEffect(() => {
    const el = scroller.current;
    if (el && !ritual) el.scrollTop = el.scrollHeight;
  }, [visibleMessages.length, phase, token, ritual]);

  const beat = pending ? beatOf(pending.beatId) : undefined;
  const showChoices = running && pending?.kind === "choices" && beat?.choices && beat.choices.length > 0;
  const composerMode: ComposerMode = showChoices
    ? "active"
    : pending?.kind === "lines" || pending?.kind === "reply" || view.mode === "gated" || ritual
      ? "locked"
      : "empty";
  const liveThought = outgoing?.delivery === "thought" ? outgoing : null;
  function divider(beatId: string, previousId?: string) {
    const context = beatOf(beatId)?.context;
    const previous = previousId ? beatOf(previousId)?.context : undefined;
    if (!context || beatId === previousId) return undefined;
    const time = context.section !== previous?.section ? context.time ?? context.entryTime
      : context.time !== previous.time ? context.time : undefined;
    return time && t(time, /^\d{2}:\d{2}$/.test(time) ? time : englishBeats[beatId]?.time ?? time);
  }
  const lastMessage = visibleMessages.at(-1);
  const currentBeat = beat ?? (lastMessage && beatOf(lastMessage.beatId));
  const timeLabel = currentBeat?.context ? undefined : currentBeat?.time ?? currentBeat?.label;
  const outgoingDay = pending && divider(pending.beatId, lastMessage?.beatId);

  useEffect(() => setShowMemoryCount(false), [state.runId, state.chapter[channel]]);
  useEffect(() => {
    if (!showMemoryCount) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !memoryCounter.current?.contains(event.target)) setShowMemoryCount(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [showMemoryCount]);

  function requestSave(entry: MemoryEntry) {
    if (memorySaved >= capacity) onMemoryFull(entry);
    else dispatch({ type: "save-memory", channel, ...entry });
  }
  const memoryCount = `${memorySaved}/${capacity}`;

  return (
    <section className="pane terminal-column" data-testid={`pane-${channel}`} aria-label={title}
      data-focused={focused || undefined} data-playing={active || undefined}>
      <header className="pane-head ascii-rule">
        <span className="pane-signal" aria-hidden="true">{active ? ">" : " "}</span>
        <span className="pane-number">USER {id} /</span>
        <span className="pane-name">{title}</span>
        <div className="pane-head-right">
          {timeLabel ? <span className="pane-meta" data-testid={`time-${channel}`}>{timeLabel}</span> : null}
          <button
            type="button"
            className="memory-entry"
            data-testid={`memory-counter-${channel}`}
            ref={memoryCounter}
            onClick={() => setShowMemoryCount(value => !value)}
            onBlur={() => setShowMemoryCount(false)}
            aria-expanded={showMemoryCount}
            aria-label={t(`Memory 数量：${memoryCount}`, `Memory count: ${memoryCount}`)}
          >
            {showMemoryCount ? `[${t("Memory 数量：", "Memory count: ")}${memoryCount}]` : `[MEM ${memoryCount}]`}
          </button>
        </div>
      </header>

      <div ref={scroller} className="messages" role="log" aria-label={t(`${title}的对话`, `${title} · Chat`)}>
        {displayed.map((message, index) => {
          const day = divider(message.beatId, visibleMessages[dropped + index - 1]?.beatId);
          return (
            <div key={message.id} data-clear-row={message.id}>
              {day ? <div className="chat-date">{day}</div> : null}
              <MessageBubble
                from={message.from}
                text={display(message)}
                delivery={message.delivery}
                caption={message.caption}
                marks={marksFor(message.beatId, message.text)}
                onSaveMark={ritual ? undefined : (text) => {
                  const candidate = (beatOf(message.beatId)?.记忆候选 ?? []).find((item) => markText(message.beatId, item) === text);
                  if (!candidate) return;
                  requestSave({ label: candidate.缩略标签, text: candidate.短句, beatId: message.beatId });
                }}
              />
            </div>
          );
        })}

        {outgoing && outgoing.delivery !== "thought" && phase !== "idle"
          && outgoingDay ? <div className="chat-date">{outgoingDay}</div> : null}

        {ritual && elapsed < RITUAL_MASK_MS + 500 && !reduced ? (
          <p className="system-line" data-clear-row="system" data-testid={`resetting-${channel}`} role="status">
            [SYS] {ritual.phase === "mask" ? t("正在清空上下文…", "Clearing context…") : t("已清空", "Context cleared")}
          </p>
        ) : null}
        {phase === "indicator" && outgoing && outgoing.delivery !== "thought" ? (
          <div className={`msg-row ${outgoing.from === "ai" ? "right" : "left"} message-wait`} data-testid={`message-wait-${channel}`}>
            <span className="msg-direction"><TerminalSpinner /></span>
            <button type="button" className={`${outgoing.from === "ai" ? "msg-ai" : "msg-user"} message-wait-button`}
              data-testid="skip" onClick={skip} aria-label={t("跳过当前播放", "Skip current playback")}>
              {outgoing.from === "ai" ? t("正在发送", "Sending") : t("正在接收", "Receiving")}
            </button>
          </div>
        ) : null}
        {(phase === "typing" || phase === "shown") && outgoing && outgoing.delivery !== "thought" ? (
          <MessageBubble
            key={outgoing.token}
            from={outgoing.from}
            text={outgoing.text}
            delivery={outgoing.delivery}
            caption={outgoing.caption}
            animate={phase === "typing"}
            typeIntervalMs={outgoing.timing.typeIntervalMs}
            onFinished={phase === "typing" ? finishTyping : undefined}
            onProgress={() => {
              const el = scroller.current;
              if (el) el.scrollTop = el.scrollHeight;
            }}
            onSkip={skip}
          />
        ) : null}
      </div>

      {!ritual && (showChoices || (liveThought && phase !== "idle" && phase !== "pause")) ? <div className="composer">
        {thought || liveThought ? (
          <div className="think-block" data-testid={`think-${channel}`}>
            <span className="think-block-head">[THINKING]</span>{" "}
            {liveThought && phase === "indicator" ? <span className="think-progress"><TerminalSpinner /> {t("正在思考", "Thinking")}</span>
              : liveThought && phase === "typing" ? <ProgressiveText key={liveThought.token} text={liveThought.text}
                interval={Math.max(15, Math.min(31, liveThought.timing.typeIntervalMs))} onFinished={finishTyping} />
                : (liveThought?.text ?? (thought && display(thought)))}
          </div>
        ) : null}
        <ChoicePanel mode={composerMode} choices={showChoices ? beat.choices!.map((choice, index) => ({
          ...choice, thought: t(choice.thought, englishBeats[beat.id]?.choices[index]?.thought[1] ?? choice.thought),
        })) : []}
          selected={selected} onMove={onMove} onPick={onPick}
          memoryGate={choice => choiceMemoryGate(state, channel, choice)} />
      </div> : null}
    </section>
  );
}

function resolveOutgoing(script: Script, state: EngineState, channel: Channel): Outgoing | null {
  const pending = state.pending[channel];
  if (!pending || pending.kind === "choices") return null;
  const beat = script.beatById?.get(pending.beatId) ?? script.beats.find((item) => item.id === pending.beatId);
  if (!beat) return null;
  if (pending.kind === "lines") {
    const line = beat.lines[pending.lineIndex];
    if (!line) return null;
    return {
      token: `${state.runId}|${beat.id}:${pending.lineIndex}`,
      id: `${beat.id}:${pending.lineIndex}`, beatId: beat.id,
      from: line.from,
      text: line.text,
      delivery: line.delivery,
      caption: line.caption,
      timing: line.timing ?? resolveTiming([]),
    };
  }
  const choice = beat.choices?.[pending.choiceIndex];
  if (!choice) return null;
  return {
    token: `${state.runId}|${beat.id}:reply:${pending.choiceIndex}`,
    id: `${beat.id}:reply:${pending.choiceIndex}`, beatId: beat.id,
    from: "ai",
    text: choice.reply,
    delivery: "type",
    timing: choice.timing ?? resolveTiming([]),
  };
}

