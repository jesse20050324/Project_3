import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { englishBeats, memoryDisplay, messageText, useLanguage } from "../language";
import { channelView, choiceMemoryGate, matchingMemoryRoute, memoryCapacity, messagesFor, RITUAL_MASK_MS } from "../engine/scheduler";
import { ritualElapsed } from "../terminalMotion";
import { TerminalSpinner } from "./TerminalSpinner";
import { ProgressiveText } from "./ProgressiveText";
import { terminalUsers } from "../terminalIdentity";
import type { Action } from "../engine/reducer";
import { crossWindowPredecessors } from "../engine/timeline";
import type {
  Channel, Delivery, EngineState, MemoryCandidate, MemoryEntry, Script, Timing,
} from "../engine/types";
import { CROSS_WINDOW_GAP_MS, DEFAULT_PACING, PACING, PLAYBACK_GAPS, PLAYBACK_SPEEDS, resolveTiming, shouldType, ZERO_TIMING } from "../presentation";
import { ChoicePanel, type ComposerMode } from "./ChoicePanel";
import type { PlaybackSpeeds } from "./PlaybackTuner";

import { playIncomingSound } from "../audio/gameSound";
import { MessageBubble, type MemoryMark } from "./MessageBubble";

type Props = {
  script: Script;
  channel: Channel;
  state: EngineState;
  dispatch: (action: Action) => void;
  completedAt: RefObject<ReadonlyMap<string, number>>;
  active: boolean;
  focused: boolean;
  selected: number;
  skipRefs: RefObject<Partial<Record<Channel, () => void>>>;
  onMove: (index: number) => void;
  onPick: (index: number) => void;
  now: number;
  reduced: boolean;
  running: boolean;
  speeds?: PlaybackSpeeds;
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
  script, channel, state, dispatch, completedAt, active, focused, selected, skipRefs, onMove, onPick, now, reduced, running, speeds,
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

  const [memoryMenu, setMemoryMenu] = useState<"open" | "full">();
  const memoryMenuRoot = useRef<HTMLDivElement>(null);
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
  const currentSpeeds = useRef(speeds);
  currentSpeeds.current = speeds;
  const currentOutgoing = useRef(original);
  currentOutgoing.current = original;
  const commitRef = useRef<() => void>(() => {});
  const stateRef = useRef(state);
  const doneToken = useRef<string | null>(null);
  const timers = useRef<number[]>([]);
  const lastPlayback = useRef<{ runId: EngineState["runId"]; id: string; finishedAt: number } | null>(null);
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
    const played = currentOutgoing.current;
    if (played && played.delivery !== "thought") {
      lastPlayback.current = { runId: stateRef.current.runId, id: played.id, finishedAt: performance.now() };
    }
    dispatch(current.kind === "lines" ? { type: "commit-line", channel } : { type: "commit-reply", channel });
  }, [channel, clearTimers, dispatch]);
  commitRef.current = commit;

  const finishTyping = useCallback(() => commitRef.current(), []);
  useEffect(() => {
    const refs = skipRefs.current;
    refs[channel] = finishTyping;
    return () => { delete refs[channel]; };
  }, [channel, finishTyping, skipRefs]);

  const lastMessage = visibleMessages.at(-1);
  const outgoingDay = outgoing && outgoing.delivery !== "thought" && divider(outgoing.beatId, lastMessage?.beatId);
  const hasDivider = Boolean(outgoingDay);

  // 虚线和接收提示一起出现。普通接续和带虚线接续分别计算，已等待的时间计入线前间隔。
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
    if (!reduced && !isReply) {
      const elapsed = previous?.runId === current.runId && previous.id === lastMessage?.id
        ? performance.now() - previous.finishedAt : undefined;
      if (hasDivider) {
        const gap = currentSpeeds.current?.beforeDivider ?? PLAYBACK_GAPS.beforeDivider;
        pauseBeforeMs = elapsed === undefined ? 0 : Math.max(0, gap * 1000 - elapsed);
      } else if (elapsed !== undefined) {
        const gap = currentSpeeds.current?.messageGap ?? PLAYBACK_GAPS.messageGap;
        const scriptedMinimum = timing.pauseBeforeMs > PACING[DEFAULT_PACING].pauseBeforeMs ? timing.pauseBeforeMs : 0;
        pauseBeforeMs = Math.max(0, Math.max(scriptedMinimum, gap * 1000) - elapsed);
      }
      const nextBeat = beatOf(outgoing.beatId);
      const pending = current.pending[channel];
      if (nextBeat && pending?.kind === "lines" && pending.lineIndex === 0) {
        const clock = performance.now();
        const predecessors = crossWindowPredecessors(nextBeat, script.beats, current.completed, current.activated);
        for (const id of predecessors) {
          const finishedAt = completedAt.current.get(id);
          if (finishedAt !== undefined) {
            pauseBeforeMs = Math.max(pauseBeforeMs, finishedAt + CROSS_WINDOW_GAP_MS - clock);
          }
        }
      }
    }
    setPhase("pause");
    later(() => {
      setPhase("indicator");
      const indicatorMs = hasDivider && !reduced
        ? (currentSpeeds.current?.afterDivider ?? PLAYBACK_GAPS.afterDivider) * 1000
        : timing.indicatorMs / (currentSpeeds.current?.indicator ?? PLAYBACK_SPEEDS.indicator);
      later(() => {
        if (outgoing.from !== "ai" && outgoing.delivery !== "thought") playIncomingSound();
        if ((!reduced && outgoing.delivery === "thought") || shouldType(outgoing.delivery, reduced)) {
          setPhase("typing");
        } else {
          setPhase("shown");
          finishTyping();
        }
      }, indicatorMs);
    }, pauseBeforeMs);
    return clearTimers;
  }, [token, channel, clearTimers, completedAt, finishTyping, hasDivider, later, outgoing?.delivery, reduced]);

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
  const currentBeat = beat ?? (lastMessage && beatOf(lastMessage.beatId));
  const timeLabel = currentBeat?.context ? undefined : currentBeat?.time ?? currentBeat?.label;

  useEffect(() => setMemoryMenu(undefined), [state.runId, state.chapter[channel], state.context?.[channel]]);
  useEffect(() => {
    if (!memoryMenu) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !memoryMenuRoot.current?.contains(event.target)) setMemoryMenu(undefined);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [memoryMenu]);

  function requestSave(entry: MemoryEntry) {
    if (memorySaved >= capacity) {
      setMemoryMenu("full");
      memoryCounter.current?.focus();
    } else dispatch({ type: "save-memory", channel, ...entry });
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
          <div className="pane-memory" ref={memoryMenuRoot} onKeyDown={event => {
            if (event.key !== "Escape" || !memoryMenu) return;
            event.stopPropagation();
            setMemoryMenu(undefined);
            memoryCounter.current?.focus();
          }}>
            <button
              type="button"
              className="memory-entry"
              data-testid={`memory-counter-${channel}`}
              ref={memoryCounter}
              onClick={() => setMemoryMenu(value => value ? undefined : "open")}
              aria-expanded={Boolean(memoryMenu)}
              aria-controls={memoryMenu ? `saved-memory-${channel}` : undefined}
              aria-label={t(`Memory 数量：${memoryCount}`, `Memory count: ${memoryCount}`)}
            >
              [MEM {memoryCount}] <span aria-hidden="true">{memoryMenu ? "▾" : "▸"}</span>
            </button>
            {memoryMenu ? <div className="pane-memory-list" id={`saved-memory-${channel}`}>
              {memoryMenu === "full" && memorySaved >= capacity ? <p role="status">
                {capacity === 5
                  ? t("记忆已满，请先舍弃一条。", "Memory full. Discard an entry first.")
                  : t("教学记忆槽已满。", "The tutorial memory slot is full.")}
              </p> : null}
              {memorySaved === 0 ? <p>{t("暂无已存记忆", "No saved memories")}</p> : <ul>
                {state.memories[channel].map(memory => {
                  const translated = memoryDisplay(memory);
                  const label = t(memory.label, translated.label);
                  return <li key={memory.label}>
                    <div><strong>{label}</strong><p>{t(memory.text, translated.text)}</p></div>
                    {capacity === 5 ? <button type="button" className="memory-entry"
                      aria-label={t(`舍弃「${label}」`, `Discard “${label}”`)} onClick={() => {
                        dispatch({ type: "forget-memory", channel, label: memory.label });
                        setMemoryMenu("open");
                        memoryCounter.current?.focus();
                      }}>[{t("舍弃", "Discard")}]</button> : null}
                  </li>;
                })}
              </ul>}
            </div> : null}
          </div>
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

        {phase !== "idle" && phase !== "pause"
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
              data-testid="skip" onClick={finishTyping} aria-label={t("跳过当前播放", "Skip current playback")}>
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
            typeIntervalMs={outgoing.timing.typeIntervalMs / (outgoing.from === "ai"
              ? speeds?.reply ?? PLAYBACK_SPEEDS.reply
              : speeds?.incoming ?? PLAYBACK_SPEEDS.incoming)}
            onFinished={phase === "typing" ? finishTyping : undefined}
            onProgress={() => {
              const el = scroller.current;
              if (el) el.scrollTop = el.scrollHeight;
            }}
            onSkip={finishTyping}
          />
        ) : null}
      </div>

      {!ritual && (showChoices || (liveThought && phase !== "idle" && phase !== "pause")) ? <div className="composer">
        {thought || liveThought ? (
          <div className="think-block" data-testid={`think-${channel}`}>
            <span className="think-block-head">[THINKING]</span>{" "}
            {liveThought && phase === "indicator" ? <span className="think-progress"><TerminalSpinner /> {t("正在思考", "Thinking")}</span>
              : liveThought && phase === "typing" ? <ProgressiveText key={liveThought.token} text={liveThought.text}
                interval={Math.max(15, Math.min(31, liveThought.timing.typeIntervalMs)) / (speeds?.thought ?? PLAYBACK_SPEEDS.thought)}
                onFinished={finishTyping} />
                : (liveThought?.text ?? (thought && display(thought)))}
          </div>
        ) : null}
        <ChoicePanel mode={composerMode} choices={showChoices ? beat.choices!.map((choice, index) => ({
          ...choice, thought: t(choice.thought, englishBeats[beat.id]?.choices[index]?.thought[1] ?? choice.thought),
        })) : []}
          selected={selected} onMove={onMove} onPick={onPick}
          memoryGate={choice => choiceMemoryGate(state, channel, choice)}
          matchedMemories={choice => matchingMemoryRoute(state, channel, choice)?.all ?? []} />
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

