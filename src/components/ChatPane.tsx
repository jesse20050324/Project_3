import { useCallback, useEffect, useRef, useState } from "react";
import { AVATAR_BOY, AVATAR_GIRL } from "../assets/avatars";
import { channelView, messagesFor } from "../engine/scheduler";
import type { Action } from "../engine/reducer";
import type {
  Channel, Delivery, EngineState, MemoryCandidate, Script, Timing,
} from "../engine/types";
import { resolveTiming, shouldType, ZERO_TIMING } from "../presentation";
import { ChoicePanel, type ComposerMode } from "./ChoicePanel";
import { BookmarkIcon, CloseIcon } from "./icons";
import { MessageBubble, type MemoryMark } from "./MessageBubble";

type Props = {
  script: Script;
  channel: Channel;
  state: EngineState;
  dispatch: (action: Action) => void;
};

type Outgoing = {
  token: string;
  from: string;
  text: string;
  delivery: Delivery;
  caption?: string;
  timing: Timing;
};

type Phase = "idle" | "pause" | "indicator" | "typing" | "shown";

export function ChatPane({ script, channel, state, dispatch }: Props) {
  const person = script.speakers.find((speaker) => speaker.channel === channel);
  const title = person?.name ?? (channel === "left" ? "男生" : "女生");
  const pending = state.pending[channel];
  const messages = messagesFor(state, channel);
  const visibleMessages = messages.filter((message) => message.delivery !== "thought");
  const thought = [...messages].reverse().find((message) => message.delivery === "thought");
  const view = channelView(state, channel, script.beats);
  const ritual = state.ritual[channel];

  const beatOf = (beatId: string) => script.beatById?.get(beatId) ?? script.beats.find((beat) => beat.id === beatId);
  const savedLabels = new Set(state.memories[channel].map((memory) => memory.label));
  const marksFor = (beatId: string, text: string): MemoryMark[] => {
    const candidates: MemoryCandidate[] = beatOf(beatId)?.记忆候选 ?? [];
    return candidates
      .filter((candidate) => text.includes(candidate.短句))
      .map((candidate) => ({ text: candidate.短句, saved: savedLabels.has(candidate.缩略标签) }));
  };
  const visibleCandidates = new Set<string>();
  for (const message of messages) {
    for (const candidate of beatOf(message.beatId)?.记忆候选 ?? []) {
      if (message.text.includes(candidate.短句)) visibleCandidates.add(candidate.缩略标签);
    }
  }
  const memoryTotal = visibleCandidates.size;
  const memorySaved = state.memories[channel].length;

  const [showMemories, setShowMemories] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const outgoing = resolveOutgoing(script, state, channel);
  const token = outgoing?.token ?? "";
  const commitRef = useRef<() => void>(() => {});
  const stateRef = useRef(state);
  const doneToken = useRef<string | null>(null);
  const timers = useRef<number[]>([]);
  const afterMsRef = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
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
    dispatch(current.kind === "lines" ? { type: "commit-line", channel } : { type: "commit-reply", channel });
  }, [channel, clearTimers, dispatch]);
  commitRef.current = commit;

  const finishTyping = useCallback(() => {
    later(() => commitRef.current(), afterMsRef.current);
  }, [later]);

  const skip = useCallback(() => commitRef.current(), []);

  // 一次消息 = pauseBefore（停顿感）→ indicator（三点）→ 逐字/整条 → afterMs（留白）→ commit。
  // 所有时长都来自该条消息解析后的定值 Timing，不再是全局常量匀速蹦。
  useEffect(() => {
    clearTimers();
    if (!outgoing) {
      setPhase("idle");
      return clearTimers;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timing = reduced ? { ...ZERO_TIMING } : outgoing.timing;
    afterMsRef.current = timing.afterMs;
    setPhase("pause");
    later(() => {
      setPhase("indicator");
      later(() => {
        if (shouldType(outgoing.delivery, reduced)) {
          setPhase("typing");
        } else {
          setPhase("shown");
          later(() => commitRef.current(), timing.afterMs);
        }
      }, timing.indicatorMs);
    }, timing.pauseBeforeMs);
    return clearTimers;
  }, [token, clearTimers, later, outgoing?.delivery]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visibleMessages.length, phase, token]);

  const beat = pending ? beatOf(pending.beatId) : undefined;
  const showChoices = pending?.kind === "choices" && beat?.choices && beat.choices.length > 0;
  const composerMode: ComposerMode = showChoices
    ? "active"
    : pending?.kind === "lines" || pending?.kind === "reply" || view.mode === "gated" || ritual
      ? "locked"
      : "empty";
  const liveThought = outgoing?.delivery === "thought" && phase !== "idle" && phase !== "pause"
    ? outgoing
    : null;
  const thinkTiming = (liveThought ?? thought)?.timing ?? resolveTiming([]);
  const thoughtSeconds = Math.max(1, Math.round(
    (thinkTiming.pauseBeforeMs + thinkTiming.indicatorMs + thinkTiming.afterMs) / 1000,
  ));
  const timeLabel = beat?.time ?? beat?.label ?? null;

  return (
    <section className="pane" data-testid={`pane-${channel}`} aria-label={title}>
      <header className="pane-head">
        <img className="pane-avatar" src={channel === "left" ? AVATAR_BOY : AVATAR_GIRL} alt="" />
        <span className="pane-name">{title}</span>
        <div className="pane-head-right">
          {timeLabel ? <span className="pane-meta" data-testid={`time-${channel}`}>{timeLabel}</span> : null}
          <button
            type="button"
            className="memory-entry"
            data-testid={`memory-counter-${channel}`}
            onClick={() => setShowMemories(true)}
            aria-label={`已存 ${memorySaved} 条记忆`}
          >
            <BookmarkIcon size={13} /> {memorySaved}/{Math.max(memoryTotal, memorySaved)}
          </button>
        </div>
      </header>

      <div ref={scroller} className="messages" role="log" aria-label={`${title}的对话`}>
        {visibleMessages.map((message) => (
          <MessageBubble
            key={message.id}
            from={message.from}
            text={message.text}
            delivery={message.delivery}
            caption={message.caption}
            marks={marksFor(message.beatId, message.text)}
            onSaveMark={(text) => {
              const candidate = (beatOf(message.beatId)?.记忆候选 ?? []).find((item) => item.短句 === text);
              if (!candidate) return;
              dispatch({ type: "save-memory", channel, label: candidate.缩略标签, text: candidate.短句, beatId: message.beatId });
            }}
          />
        ))}

        {phase === "indicator" && outgoing && outgoing.delivery !== "thought" ? (
          <div className={`msg-row ${outgoing.from === "ai" ? "right" : "left"}`}>
            <button type="button" className="typing" data-testid="skip" onClick={skip} aria-label="正在输入，点击跳过">
              <span className="typing-dots" aria-hidden="true"><i /><i /><i /></span>
              正在输入
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

      <div className="composer">
        {thought || liveThought ? (
          <div className="think-block" data-testid={`think-${channel}`}>
            <div className="think-block-head">已思考 {thoughtSeconds} 秒</div>
            {liveThought && phase === "indicator" ? (
              <button type="button" className="typing" data-testid="skip" onClick={skip} aria-label="正在思考，点击跳过">
                <span className="typing-dots" aria-hidden="true"><i /><i /><i /></span>
                正在输入
              </button>
            ) : (
              (liveThought ?? thought)?.text
            )}
          </div>
        ) : null}
        <ChoicePanel
          mode={composerMode}
          choices={showChoices ? beat?.choices ?? [] : []}
          gateFor={(index) => {
            const need = beat?.choices?.[index]?.需记忆;
            return need && !savedLabels.has(need) ? need : null;
          }}
          tagFor={(index) => {
            const need = beat?.choices?.[index]?.需记忆;
            return need && savedLabels.has(need) ? need : null;
          }}
          onPick={(index) => dispatch({ type: "choose", channel, index })}
        />
      </div>

      {ritual ? (
        <div className="ritual-mask" data-testid={`resetting-${channel}`} role="status">
          <span className="typing">
            <span className="typing-dots" aria-hidden="true"><i /><i /><i /></span>
            上下文重置中
          </span>
        </div>
      ) : null}

      {showMemories ? (
        <div className="memory-dialog" role="dialog" aria-label="记忆">
          <div className="memory-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3>{title}窗的记忆</h3>
              <button
                type="button"
                className="memory-entry"
                data-testid={`memory-close-${channel}`}
                onClick={() => setShowMemories(false)}
                aria-label="关闭"
              >
                <CloseIcon size={15} />
              </button>
            </div>
            {state.memories[channel].length === 0 ? (
              <p className="memory-empty" data-testid={`memory-empty-${channel}`}>还没存下任何记忆。</p>
            ) : (
              <ul className="memory-list">
                {state.memories[channel].map((memory) => (
                  <li key={memory.label} data-testid="memory-entry">
                    <b>{memory.label}</b>
                    <span>「{memory.text}」</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
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
      token: `${state.runId}|${beat.id}:line:${pending.lineIndex}`,
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
    from: "ai",
    text: choice.reply,
    delivery: "type",
    timing: choice.timing ?? resolveTiming([]),
  };
}

