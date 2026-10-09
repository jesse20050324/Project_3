import type {
  Beat,
  Channel,
  ChannelView,
  ChatMessage,
  EngineState,
  Scalar,
} from "./types";
import { channelName } from "./validate";

/**
 * A root is a beat nobody points at with `next`.
 * It may start as soon as its `requires` are done.
 * Every other beat stays dark until the choice or linear next that names it has been taken.
 */
export function isRoot(beat: Beat, beats: Beat[]): boolean {
  return !beats.some(
    (other) =>
      other.next === beat.id || other.choices?.some((choice) => choice.next === beat.id),
  );
}

export function createInitial(beats: Beat[]): EngineState {
  return {
    completed: [],
    flags: {},
    activated: beats.filter((beat) => isRoot(beat, beats)).map((beat) => beat.id),
    messages: [],
    pending: { left: null, right: null },
  };
}

/** Roots added after a save was written still need to enter the active set. */
export function withMissingRoots(state: EngineState, beats: Beat[]): EngineState {
  const extra = beats
    .filter((beat) => isRoot(beat, beats) && !state.activated.includes(beat.id) && !state.completed.includes(beat.id))
    .map((beat) => beat.id);
  if (extra.length === 0) return state;
  return { ...state, activated: [...state.activated, ...extra] };
}

export function messagesFor(state: EngineState, channel: Channel): ChatMessage[] {
  return state.messages.filter((message) => message.channel === channel);
}

export function deliveryAnimates(delivery: ChatMessage["delivery"]): boolean {
  return delivery === "type";
}

export function availableBeat(state: EngineState, channel: Channel, beats: Beat[]): Beat | null {
  for (const beat of beats) {
    if (beat.channel !== channel) continue;
    if (state.completed.includes(beat.id)) continue;
    if (!state.activated.includes(beat.id)) continue;
    if (whenState(beat, state.flags) !== "ok") continue;
    if ((beat.requires ?? []).some((id) => !state.completed.includes(id))) continue;
    return beat;
  }
  return null;
}

export function channelView(state: EngineState, channel: Channel, beats: Beat[]): ChannelView {
  const available = availableBeat(state, channel, beats);
  const locked = [];
  for (const beat of beats) {
    if (beat.channel !== channel) continue;
    if (state.completed.includes(beat.id)) continue;
    if (!state.activated.includes(beat.id)) continue;
    const gate = whenState(beat, state.flags);
    if (gate === "no") continue;
    const unmet = (beat.requires ?? []).filter((id) => !state.completed.includes(id));
    if (gate === "wait") {
      locked.push({ id: beat.id, unmet: unmet.length > 0 ? unmet : Object.keys(beat.when ?? {}) });
      continue;
    }
    if (unmet.length > 0) locked.push({ id: beat.id, unmet });
  }
  const hasBeats = beats.some((beat) => beat.channel === channel);
  const mode = !hasBeats
    ? "empty"
    : available
      ? "available"
      : locked.length > 0
        ? "gated"
        : "ended";
  return { mode, availableId: available?.id ?? null, locked };
}

export function playerStatus(view: ChannelView): string | null {
  if (view.mode === "gated") return "等另一边先做出选择，这一侧才会发消息。";
  if (view.mode === "empty") return "暂时没有消息。";
  if (view.mode === "ended") return "先到这里。";
  return null;
}

export function formatFlags(flags: Record<string, Scalar>): string {
  const keys = Object.keys(flags);
  if (keys.length === 0) return "（无）";
  return keys.map((key) => `${key} = ${String(flags[key])}`).join("，");
}

export function describeChannel(state: EngineState, channel: Channel, beats: Beat[]): string {
  const pending = state.pending[channel];
  const done = state.completed.filter((id) => beats.some((beat) => beat.id === id && beat.channel === channel));
  const doneText = done.length > 0 ? done.join("、") : "无";
  if (pending?.kind === "lines") {
    return `正在播出 ${pending.beatId}，选择还锁着。已完成：${doneText}`;
  }
  if (pending?.kind === "reply") {
    return `正在发出 ${pending.beatId} 的回复，选择还锁着。已完成：${doneText}`;
  }
  if (pending?.kind === "choices") {
    return `在等选择：${pending.beatId}。已完成：${doneText}`;
  }
  const view = channelView(state, channel, beats);
  if (view.mode === "empty") return "这一侧还没有写好的节拍。";
  if (view.mode === "gated") {
    const reasons = view.locked
      .map((item) => `下一段 ${item.id} 还不能开始，要先完成 ${item.unmet.join("、")}。未放出的台词不会显示在这里。`)
      .join(" ");
    return `${reasons}已完成：${doneText}`;
  }
  if (view.mode === "ended") return `先到这里。已完成：${doneText}`;
  return `下一段可以开始：${view.availableId}。已完成：${doneText}`;
}

export function openChannel(state: EngineState, channel: Channel, beats: Beat[]): EngineState {
  if (state.pending[channel]) return state;
  const beat = availableBeat(state, channel, beats);
  if (!beat) return state;
  if (beat.lines.length === 0 && beat.choices && beat.choices.length > 0) {
    return withPending(state, channel, { kind: "choices", beatId: beat.id });
  }
  return withPending(state, channel, { kind: "lines", beatId: beat.id, lineIndex: 0 });
}

export function commitLine(state: EngineState, channel: Channel, beats: Beat[]): EngineState {
  const pending = state.pending[channel];
  if (!pending || pending.kind !== "lines") {
    throw new Error(`${channelName(channel)}没有正在播出的台词`);
  }
  const beat = mustBeat(beats, pending.beatId);
  const line = beat.lines[pending.lineIndex];
  if (!line) {
    throw new Error(`节拍 ${beat.id} 没有第 ${pending.lineIndex + 1} 句`);
  }
  const messages = [
    ...state.messages,
    {
      id: `${beat.id}:${pending.lineIndex}`,
      channel,
      beatId: beat.id,
      from: line.from,
      text: line.text,
      delivery: line.delivery,
      caption: line.caption,
    },
  ];
  const nextIndex = pending.lineIndex + 1;
  if (nextIndex < beat.lines.length) {
    return {
      ...withPending(state, channel, { kind: "lines", beatId: beat.id, lineIndex: nextIndex }),
      messages,
    };
  }
  if (beat.choices && beat.choices.length > 0) {
    return {
      ...withPending(state, channel, { kind: "choices", beatId: beat.id }),
      messages,
    };
  }
  return openChannel(completeBeat(state, channel, beat, messages, undefined, beat.next), channel, beats);
}

export function choose(
  state: EngineState,
  channel: Channel,
  index: number,
  beats: Beat[],
): EngineState {
  const pending = state.pending[channel];
  if (!pending || pending.kind !== "choices") {
    throw new Error(`${channelName(channel)}还不能选：这一侧的话还没说完`);
  }
  const beat = mustBeat(beats, pending.beatId);
  const choice = beat.choices?.[index];
  if (!choice) {
    throw new Error(`节拍 ${beat.id} 没有第 ${index + 1} 个选项`);
  }
  return withPending(state, channel, { kind: "reply", beatId: beat.id, choiceIndex: index });
}

export function commitReply(state: EngineState, channel: Channel, beats: Beat[]): EngineState {
  const pending = state.pending[channel];
  if (!pending || pending.kind !== "reply") {
    throw new Error(`${channelName(channel)}没有待发出的回复`);
  }
  const beat = mustBeat(beats, pending.beatId);
  const choice = beat.choices?.[pending.choiceIndex];
  if (!choice) {
    throw new Error(`节拍 ${beat.id} 没有第 ${pending.choiceIndex + 1} 个选项`);
  }
  const messages = [
    ...state.messages,
    {
      id: `${beat.id}:reply:${pending.choiceIndex}`,
      channel,
      beatId: beat.id,
      from: "ai",
      text: choice.reply,
      delivery: "type" as const,
    },
  ];
  return openChannel(completeBeat(state, channel, beat, messages, choice.set, choice.next), channel, beats);
}

function completeBeat(
  state: EngineState,
  channel: Channel,
  beat: Beat,
  messages: ChatMessage[],
  set: Record<string, Scalar> | undefined,
  next: string | undefined,
): EngineState {
  if (state.completed.includes(beat.id)) return state;
  const flags = { ...state.flags };
  if (set) {
    for (const [key, value] of Object.entries(set)) flags[key] = value;
  }
  const activated =
    next && !state.activated.includes(next) ? [...state.activated, next] : state.activated;
  return {
    ...state,
    messages,
    flags,
    activated,
    completed: [...state.completed, beat.id],
    pending: { ...state.pending, [channel]: null },
  };
}

function withPending(state: EngineState, channel: Channel, pending: EngineState["pending"][Channel]): EngineState {
  return { ...state, pending: { ...state.pending, [channel]: pending } };
}

function whenState(beat: Beat, flags: Record<string, Scalar>): "ok" | "wait" | "no" {
  if (!beat.when) return "ok";
  for (const [key, value] of Object.entries(beat.when)) {
    if (!(key in flags)) return "wait";
    if (flags[key] !== value) return "no";
  }
  return "ok";
}

function mustBeat(beats: Beat[], id: string): Beat {
  const beat = beats.find((item) => item.id === id);
  if (!beat) throw new Error(`找不到节拍 ${id}`);
  return beat;
}
