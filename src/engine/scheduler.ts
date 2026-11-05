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
    memories: { left: [], right: [] },
  };
}

/** 把一条候选存进该窗的记忆池。同一缩略标签只存一次。 */
export function saveMemory(
  state: EngineState,
  channel: Channel,
  entry: { label: string; text: string; beatId: string },
): EngineState {
  if (entry.label.trim() === "") return state;
  if (state.memories[channel].some((memory) => memory.label === entry.label)) return state;
  return {
    ...state,
    memories: { ...state.memories, [channel]: [...state.memories[channel], entry] },
  };
}

/** 该窗是否已存某条记忆（置灰门判定用）。 */
export function hasMemory(state: EngineState, channel: Channel, label: string): boolean {
  return state.memories[channel].some((memory) => memory.label === label);
}

/**
 *「记忆可用」便签判定——已按用户要求移到选项上（见 ChoicePanel tagFor）。
 */

/**
 * 串行节拍：本窗现在是否可以开演。
 * 规则：自己已有 pending 不开；对面正在播出（lines/reply）不开——
 * 面停在 choices 等玩家视为"完全结束"，不挡人。
 * 双方同时就绪时，上一条消息所在的一侧优先（无消息开局左侧优先），
 * 形成一来一回的节奏，两窗消息不会并行冒出。
 */
export function canArm(state: EngineState, channel: Channel, beats: Beat[]): boolean {
  if (state.pending[channel]) return false;
  const other: Channel = channel === "left" ? "right" : "left";
  const otherPending = state.pending[other];
  if (otherPending && otherPending.kind !== "choices") return false;
  if (channelView(state, channel, beats).mode !== "available") return false;
  // 对面停在选项上不算"还有货要播"，只有它真的有下一拍可开才抢优先权
  const otherReady = otherPending?.kind !== "choices" && channelView(state, other, beats).mode === "available";
  if (!otherReady) return true;
  const last = state.messages[state.messages.length - 1];
  if (!last) return channel === "left";
  return last.channel === channel;
}

export type PlaybackStep = { type: "arm" | "reset"; channel: Channel };

/**
 * 下一件播控动作。两窗共用这一处判断，避免各窗自己的定时器把开演权交出去后没人再喊。
 * 正在重置的窗跳过；轮到且下一拍跨章的窗先重置，否则直接开演。
 * 没有轮到的窗返回不了动作，调用方在状态再变时（对方仪式结束、记录被清空）重问一次。
 */
export function playbackStep(
  state: EngineState,
  beats: Beat[],
  resetting: Record<Channel, boolean>,
): PlaybackStep | null {
  for (const channel of ["left", "right"] as const) {
    if (resetting[channel]) continue;
    if (state.pending[channel]) continue;
    if (!canArm(state, channel, beats)) continue;
    const next = availableBeat(state, channel, beats);
    if (next && crossesChapterBoundary(state, channel, next, beats)) {
      return { type: "reset", channel };
    }
    return { type: "arm", channel };
  }
  return null;
}

/** 阅后即焚：清掉本窗全部聊天记录（按窗，另一窗不动，已存记忆不动）。 */
export function clearChannelMessages(state: EngineState, channel: Channel): EngineState {
  if (!state.messages.some((message) => message.channel === channel)) return state;
  return { ...state, messages: state.messages.filter((message) => message.channel !== channel) };
}

/**
 * A save written before a beat existed never runs completeBeat for what came before it.
 * Roots still need to enter the active set.
 * So does a beat named by a completed beat's own linear `next`.
 * Choice targets stay dark: finishing the choice beat must not open a branch that was not taken.
 */
export function withMissingRoots(state: EngineState, beats: Beat[]): EngineState {
  const known = new Set([...state.activated, ...state.completed]);
  const extra = beats
    .filter((beat) => !known.has(beat.id) && (isRoot(beat, beats) || reachedByCompletedNext(beat, state, beats)))
    .map((beat) => beat.id);
  if (extra.length === 0) return state;
  return { ...state, activated: [...state.activated, ...extra] };
}

function reachedByCompletedNext(beat: Beat, state: EngineState, beats: Beat[]): boolean {
  return beats.some((other) => other.next === beat.id && state.completed.includes(other.id));
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
  return openNextInChapter(completeBeat(state, channel, beat, messages, undefined, beat.next), channel, beats);
}

/**
 * commit 完一拍后的自动续播：下一拍仍在同一章就照旧接着开（"播完自动接上"的手感不变）。
 * 跨章则不自动开，留在 pending=null 交给 playbackStep：
 * 先走「上下文重置中」，仪式结束再开新章。
 * 否则 next 衔接的换幕会两幕消息连播，看不出换章。
 */
function openNextInChapter(state: EngineState, channel: Channel, beats: Beat[]): EngineState {
  const next = availableBeat(state, channel, beats);
  if (next && crossesChapterBoundary(state, channel, next, beats)) return state;
  return openChannel(state, channel, beats);
}

function crossesChapterBoundary(state: EngineState, channel: Channel, nextBeat: Beat, beats: Beat[]): boolean {
  const last = [...state.messages].reverse().find((message) => message.channel === channel);
  if (!last) return false;
  const lastBeat = beats.find((beat) => beat.id === last.beatId);
  return lastBeat?.chapter !== undefined && nextBeat.chapter !== undefined && lastBeat.chapter !== nextBeat.chapter;
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
  if (choice.需记忆 && !hasMemory(state, channel, choice.需记忆)) {
    throw new Error(`节拍 ${beat.id} 的选项「${choice.thought}」需要记忆「${choice.需记忆}」，本窗还没存`);
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
  return openNextInChapter(completeBeat(state, channel, beat, messages, choice.set, choice.next), channel, beats);
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
  const memories = wipeMemories(state.memories, beat.清空记忆);
  const activated =
    next && !state.activated.includes(next) ? [...state.activated, next] : state.activated;
  return {
    ...state,
    messages,
    flags,
    memories,
    activated,
    completed: [...state.completed, beat.id],
    pending: { ...state.pending, [channel]: null },
  };
}

function wipeMemories(
  memories: EngineState["memories"],
  wipe: Beat["清空记忆"],
): EngineState["memories"] {
  if (!wipe) return memories;
  if (wipe === "all") return { left: [], right: [] };
  return { ...memories, [wipe]: [] };
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
