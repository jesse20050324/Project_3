import { useCallback, useEffect, useRef, useState } from "react";
import { nameOf } from "../engine/loadScript";
import { channelView, messagesFor, playerStatus } from "../engine/scheduler";
import type { Action } from "../engine/reducer";
import type { Channel, Delivery, EngineState, Script } from "../engine/types";
import { INDICATOR_MS, shouldType } from "../presentation";
import { ChoicePanel } from "./ChoicePanel";
import { MessageBubble } from "./MessageBubble";

type Props = {
  script: Script;
  channel: Channel;
  state: EngineState;
  dispatch: (action: Action) => void;
  hidden: boolean;
};

type Outgoing = {
  token: string;
  from: string;
  text: string;
  delivery: Delivery;
  caption?: string;
};

export function ChatPane({ script, channel, state, dispatch, hidden }: Props) {
  const person = script.speakers.find((speaker) => speaker.channel === channel);
  const title = person?.name ?? (channel === "left" ? "左侧" : "右侧");
  const pending = state.pending[channel];
  const messages = messagesFor(state, channel);
  const outgoing = resolveOutgoing(script, state, channel);
  const token = outgoing?.token ?? "";
  const [live, setLive] = useState<{ token: string; phase: "indicator" | "typing" } | null>(null);
  const doneToken = useRef<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  const scriptRef = useRef(script);
  const dispatchRef = useRef(dispatch);
  stateRef.current = state;
  scriptRef.current = script;
  dispatchRef.current = dispatch;

  const commit = useCallback(() => {
    const current = stateRef.current.pending[channel];
    if (!current || current.kind === "choices") return;
    const currentToken =
      current.kind === "lines"
        ? `${current.beatId}:line:${current.lineIndex}`
        : `${current.beatId}:reply:${current.choiceIndex}`;
    if (doneToken.current === currentToken) return;
    doneToken.current = currentToken;
    dispatchRef.current(current.kind === "lines" ? { type: "commit-line", channel } : { type: "commit-reply", channel });
  }, [channel]);

  const completedKey = state.completed.join("|");
  const activatedKey = state.activated.join("|");

  useEffect(() => {
    if (state.pending[channel]) return;
    dispatch({ type: "arm", channel });
  }, [state.pending, channel, completedKey, activatedKey, dispatch]);

  useEffect(() => {
    const next = resolveOutgoing(scriptRef.current, stateRef.current, channel);
    if (!next) {
      setLive(null);
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!shouldType(next.delivery, reduced)) {
      const wait = next.delivery === "image" || reduced ? 0 : INDICATOR_MS[next.delivery];
      setLive(wait === 0 ? null : { token: next.token, phase: "indicator" });
      const timer = window.setTimeout(commit, wait);
      return () => window.clearTimeout(timer);
    }
    setLive({ token: next.token, phase: "indicator" });
    const timer = window.setTimeout(() => setLive({ token: next.token, phase: "typing" }), INDICATOR_MS.type);
    return () => window.clearTimeout(timer);
  }, [token, channel, commit]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, live, token]);

  const view = channelView(state, channel, script.beats);
  const status = pending ? null : playerStatus(view);
  const beat = pending ? script.beats.find((item) => item.id === pending.beatId) : undefined;
  const showChoices = pending?.kind === "choices" && beat?.choices && beat.choices.length > 0;

  return (
    <section
      data-testid={`pane-${channel}`}
      aria-label={title}
      className={hidden ? "hidden" : "flex h-full min-h-0 min-w-0 flex-col bg-[#f7f4ee]"}
    >
      <header className="flex items-center gap-2 border-b border-[#efeae2] px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e7eeeb] text-sm text-[#2f5d54]">
          {title.slice(0, 1)}
        </span>
        <h2 className="text-sm font-medium">{title}</h2>
      </header>
      <div ref={scroller} role="log" aria-label={`${title}的对话`} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !outgoing && !showChoices ? (
          <div className="flex flex-1 items-center justify-center">
            {status ? (
              <p data-testid={`status-${channel}`} className="text-sm text-[#6b645b]">
                {status}
              </p>
            ) : null}
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              from={message.from}
              speakerName={nameOf(script, message.from)}
              text={message.text}
              delivery={message.delivery}
              caption={message.caption}
              animate={false}
            />
          ))
        )}
        {live?.token === token && live.phase === "indicator" && outgoing ? (
          <div className={outgoing.from === "ai" ? "self-end" : "self-start"}>
            <button
              type="button"
              data-testid="skip"
              onClick={commit}
              className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm text-[#5c564e] shadow-[0_1px_2px_rgba(40,30,10,0.05)]"
            >
              <span className="flex gap-1" aria-hidden="true">
                <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-[#2f5d54]" />
                <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-[#2f5d54] [animation-delay:150ms]" />
                <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-[#2f5d54] [animation-delay:300ms]" />
              </span>
              正在输入
              <span className="text-[11px] text-[#8a8175]">点击跳过</span>
            </button>
          </div>
        ) : null}
        {live?.token === token && live.phase === "typing" && outgoing ? (
          <div onClick={commit} className={outgoing.from === "ai" ? "self-end" : "self-start"}>
            <MessageBubble
              key={outgoing.token}
              from={outgoing.from}
              speakerName={nameOf(script, outgoing.from)}
              text={outgoing.text}
              delivery={outgoing.delivery}
              caption={outgoing.caption}
              animate
              onFinished={commit}
              onProgress={() => {
                const el = scroller.current;
                if (el) el.scrollTop = el.scrollHeight;
              }}
            />
            <button type="button" data-testid="skip" onClick={commit} className="mt-1 px-1 text-[11px] text-[#8a8175]">
              点击跳过
            </button>
          </div>
        ) : null}
      </div>
      {showChoices && beat ? (
        <ChoicePanel
          aside={beat.aside}
          choices={beat.choices ?? []}
          onPick={(index) => dispatch({ type: "choose", channel, index })}
        />
      ) : null}
      {!showChoices && status && messages.length > 0 ? (
        <p data-testid={`status-${channel}`} className="border-t border-[#efeae2] px-4 py-3 text-center text-xs text-[#6b645b]">
          {status}
        </p>
      ) : null}
    </section>
  );
}

function resolveOutgoing(script: Script, state: EngineState, channel: Channel): Outgoing | null {
  const pending = state.pending[channel];
  if (!pending || pending.kind === "choices") return null;
  const beat = script.beats.find((item) => item.id === pending.beatId);
  if (!beat) return null;
  if (pending.kind === "lines") {
    const line = beat.lines[pending.lineIndex];
    if (!line) return null;
    return {
      token: `${beat.id}:line:${pending.lineIndex}`,
      from: line.from,
      text: line.text,
      delivery: line.delivery,
      caption: line.caption,
    };
  }
  const choice = beat.choices?.[pending.choiceIndex];
  if (!choice) return null;
  return {
    token: `${beat.id}:reply:${pending.choiceIndex}`,
    from: "ai",
    text: choice.reply,
    delivery: "type",
  };
}
