import { compareBeats, windowState, windowViolation } from "./timeline";
import type {
  Beat, Channel, ChannelView, ChatMessage, Ending, EngineState, Scalar,
} from "./types";
import { channelName } from "./validate";

/** 跨章「上下文重置」仪式节奏（毫秒）。持久化在 EngineState，刷新后可恢复。 */
export const RITUAL_MASK_MS = 2200;
export const RITUAL_PAUSE_MS = 2000;

/**
 * A root is a beat nobody points at with `next`.
 * It may start as soon as its `requires` / `when` / `window` are satisfied.
 */
export function isRoot(beat: Beat, beats: Beat[]): boolean {
  return !beats.some(
    (other) =>
      other.next === beat.id || other.choices?.some((choice) => choice.next === beat.id),
  );
}

function firstChapter(beats: Beat[], channel: Channel): number {
  const chapters = beats
    .filter((beat) => beat.channel === channel)
    .map((beat) => beat.chapter ?? 0)
    .filter((chapter) => chapter > 0);
  return chapters.length > 0 ? Math.min(...chapters) : 1;
}

export function createInitial(beats: Beat[]): EngineState {
  return {
    completed: [],
    flags: {},
    activated: beats.filter((beat) => isRoot(beat, beats)).map((beat) => beat.id),
    messages: [],
    pending: { left: null, right: null },
    memories: { left: [], right: [] },
    chapter: { left: firstChapter(beats, "left"), right: firstChapter(beats, "right") },
    ritual: { left: null, right: null },
    endings: [],
    error: null,
    runId: 0,
  };
}

export function memoryCapacity(state: EngineState, channel: Channel): number | undefined {
  return state.chapter[channel] >= 5 ? 5 : undefined;
}

/** 满槽时必须由玩家指定要替换的记忆。存入和移出在一次更新中完成。 */
export function saveMemory(
  state: EngineState,
  channel: Channel,
  entry: { label: string; text: string; beatId: string },
  replaceLabel?: string,
): EngineState {
  const saved = state.memories[channel];
  if (entry.label.trim() === "" || saved.some(memory => memory.label === entry.label)) return state;
  const full = saved.length >= (memoryCapacity(state, channel) ?? Infinity);
  if (full && !replaceLabel) return state;
  if (replaceLabel && !saved.some(memory => memory.label === replaceLabel)) return state;
  const next = saved.filter(memory => memory.label !== replaceLabel);
  if (next.length >= (memoryCapacity(state, channel) ?? Infinity)) return state;
  return { ...state, memories: { ...state.memories, [channel]: [...next, entry] } };
}

export function forgetMemory(state: EngineState, channel: Channel, label: string): EngineState {
  const saved = state.memories[channel];
  const next = saved.filter(memory => memory.label !== label);
  if (next.length === saved.length) return state;
  return {
    ...state,
    memories: { ...state.memories, [channel]: next },
  };
}

/** 该窗是否已存某条记忆（置灰门判定用）。 */
export function hasMemory(state: EngineState, channel: Channel, label: string): boolean {
  return state.memories[channel].some((memory) => memory.label === label);
}

/**
 * 本窗现在是否具备开演条件。
 * 保留「一活一锁」的全局串行：对面正在播出（lines/reply）时不放行；
 * 对面停在 choices 等玩家不算占用播出通道。
 * 「谁先谁后」不再看 state.messages 最后一条属于哪一侧，改由 playbackStep
 * 按 timeline 的全局排序键统一裁决。
 */
export function canArm(state: EngineState, channel: Channel, beats: Beat[]): boolean {
  if (state.ritual?.[channel]) return false;
  if (state.pending[channel]) return false;
  const other: Channel = channel === "left" ? "right" : "left";
  const otherPending = state.pending[other];
  if (otherPending && otherPending.kind !== "choices") return false;
  const candidate = availableBeat(state, channel, beats);
  if (!candidate) return false;
  // Preserve the reviewed timeline across unanswered choices and chapter resets.
  // A second window may start its own reset while the first reset is in progress.
  if ((candidate.chapter ?? 0) >= 5) {
    const otherBeat = otherPending?.kind === "choices"
      ? beats.find((item) => item.id === otherPending.beatId)
      : state.ritual[other] && candidate.chapter === state.chapter[channel]
        ? availableBeat(state, other, beats)
        : null;
    if (otherBeat && compareBeats(otherBeat, candidate) < 0) return false;
  }
  return true;
}

export type PlaybackStep = { type: "arm"; channel: Channel };

/**
 * 全局唯一的开演决策点。两窗候选按剧本排序键比较，取最靠前的一拍。
 * 这样「哪个先播哪个后播」由剧本决定，不会因消息到达顺序或刷新而变。
 */
export function playbackStep(state: EngineState, beats: Beat[]): PlaybackStep | null {
  for (const channel of ["left", "right"] as const) {
    const pending = state.pending[channel];
    if (pending && pending.kind !== "choices") return null;
  }
  const candidates: { channel: Channel; beat: Beat }[] = [];
  for (const channel of ["left", "right"] as const) {
    if (state.ritual?.[channel]) continue;
    if (state.pending[channel]) continue;
    if (!canArm(state, channel, beats)) continue;
    const beat = availableBeat(state, channel, beats);
    if (beat) candidates.push({ channel, beat });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => compareBeats(a.beat, b.beat));
  return { type: "arm", channel: candidates[0].channel };
}

/** 阅后即焚：清掉本窗全部聊天记录（按窗，另一窗不动，已存记忆不动）。 */
export function clearChannelMessages(state: EngineState, channel: Channel): EngineState {
  if (!state.messages.some((message) => message.channel === channel)) return state;
  return { ...state, messages: state.messages.filter((message) => message.channel !== channel) };
}

/** 推进持久化仪式：mask → 清空本窗记录 + 切章 + pause → 结束。刷新后靠 until 恢复。 */
export function ritualTick(state: EngineState, channel: Channel, now: number): EngineState {
  const ritual = state.ritual?.[channel];
  if (!ritual || now < ritual.until) return state;
  if (ritual.phase === "mask") {
    const cleared = clearChannelMessages(state, channel);
    return {
      ...cleared,
      chapter: { ...cleared.chapter, [channel]: ritual.to },
      ritual: {
        ...cleared.ritual,
        [channel]: { ...ritual, phase: "pause", until: now + RITUAL_PAUSE_MS },
      },
    };
  }
  return { ...state, ritual: { ...state.ritual, [channel]: null } };
}

/** 已激活却因区间关闭而永远播不出的拍，必须显式报错而不是静默卡住。 */
export function detectWindowViolation(state: EngineState, beats: Beat[]): string | null {
  const completed = new Set(state.completed);
  for (const beat of beats) {
    if (completed.has(beat.id)) continue;
    if (!state.activated.includes(beat.id)) continue;
    if (windowState(beat, completed) === "closed") {
      return windowViolation(beat, completed);
    }
  }
  return null;
}

/**
 * 旧存档兼容：只在读取存档时补一次根拍与已完成线性 next。
 * 不再作为运行时 useEffect 的补丁（那正是章间死锁的来源之一）。
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

/**
 * 本窗下一个可播拍：按剧本排序键取最靠前的一个。
 * requires = 严格等待门；window = 区间门（下界未到 / 上界已过都不放行）。
 */
export function availableBeat(state: EngineState, channel: Channel, beats: Beat[]): Beat | null {
  const completed = new Set(state.completed);
  let best: Beat | null = null;
  for (const beat of beats) {
    if (beat.channel !== channel) continue;
    if (completed.has(beat.id)) continue;
    if (!state.activated.includes(beat.id)) continue;
    if (whenState(beat, state.flags) !== "ok") continue;
    if ((beat.requires ?? []).some((id) => !completed.has(id))) continue;
    const gate = windowState(beat, completed);
    if (gate === "waiting" || gate === "closed") continue;
    if (!best || compareBeats(beat, best) < 0) best = beat;
  }
  return best;
}

export function channelView(state: EngineState, channel: Channel, beats: Beat[]): ChannelView {
  const available = availableBeat(state, channel, beats);
  const locked = [];
  const completed = new Set(state.completed);
  for (const beat of beats) {
    if (beat.channel !== channel) continue;
    if (completed.has(beat.id)) continue;
    if (!state.activated.includes(beat.id)) continue;
    const gate = whenState(beat, state.flags);
    if (gate === "no") continue;
    const unmet = (beat.requires ?? []).filter((id) => !completed.has(id));
    const window = windowState(beat, completed);
    if (gate === "wait" || window === "waiting") {
      locked.push({ id: beat.id, unmet: unmet.length > 0 ? unmet : Object.keys(beat.when ?? {}) });
      continue;
    }
    if (window === "closed") {
      locked.push({ id: beat.id, unmet: [`区间已关闭：${beat.window?.上界.join("/") ?? ""}`] });
      continue;
    }
    if (unmet.length > 0) locked.push({ id: beat.id, unmet });
  }
  const hasBeats = beats.some((beat) => beat.channel === channel);
  const endingId = state.endings.find((id) =>
    beats.some((beat) => beat.ending === id && beat.channel === channel && completed.has(beat.id)),
  ) ?? null;
  const mode = !hasBeats
    ? "empty"
    : available
      ? "available"
      : locked.length > 0
        ? "gated"
        : "ended";
  return { mode, availableId: available?.id ?? null, locked, endingId };
}

/** 终局达成：某 ending 标记的所有拍都已完成（双窗共同抵达）。 */
function achievedEndings(state: EngineState, beats: Beat[]): string[] {
  const groups = new Map<string, string[]>();
  for (const beat of beats) {
    if (!beat.ending) continue;
    groups.set(beat.ending, [...(groups.get(beat.ending) ?? []), beat.id]);
  }
  const completed = new Set(state.completed);
  return [...groups.entries()]
    .filter(([, ids]) => ids.length > 0 && ids.every((id) => completed.has(id)))
    .map(([id]) => id);
}

export function openChannel(
  state: EngineState,
  channel: Channel,
  beats: Beat[],
  now: number = Date.now(),
): EngineState {
  if (!canArm(state, channel, beats)) return state;
  const beat = availableBeat(state, channel, beats);
  if (!beat) return state;
  const targetChapter = beat.chapter ?? state.chapter[channel];
  if (targetChapter !== state.chapter[channel]) {
    return {
      ...state,
      ritual: {
        ...state.ritual,
        [channel]: {
          from: state.chapter[channel],
          to: targetChapter,
          phase: "mask",
          until: now + RITUAL_MASK_MS,
        },
      },
    };
  }
  if (beat.lines.length === 0 && beat.choices && beat.choices.length > 0) {
    return withPending(state, channel, { kind: "choices", beatId: beat.id });
  }
  // Silent routing/exit markers carry causality without invented dialogue.
  if (beat.control) {
    return completeBeat(state, channel, beat, state.messages, undefined, beat.next, beats);
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
      timing: line.timing,
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
  // 不再自动接下一拍：播完就放开这一窗，由 playbackStep 按全局排序键裁决下一拍。
  // 旧引擎在这里直接 openChannel，正是「一条线一路播到底、另一条线等不到」的根因。
  return completeBeat(state, channel, beat, messages, undefined, beat.next, beats);
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
      timing: choice.timing,
    },
  ];
  return completeBeat(state, channel, beat, messages, choice.set, choice.next, beats);
}

function completeBeat(
  state: EngineState,
  channel: Channel,
  beat: Beat,
  messages: ChatMessage[],
  set: Record<string, Scalar> | undefined,
  next: string | undefined,
  beats: Beat[],
): EngineState {
  if (state.completed.includes(beat.id)) return state;
  const flags = { ...state.flags };
  if (set) {
    for (const [key, value] of Object.entries(set)) flags[key] = value;
  }
  const memories = wipeMemories(state.memories, beat.清空记忆);
  const activated =
    next && !state.activated.includes(next) ? [...state.activated, next] : state.activated;
  const completed = [...state.completed, beat.id];
  const nextState: EngineState = {
    ...state,
    messages,
    flags,
    memories,
    activated,
    completed,
    pending: { ...state.pending, [channel]: null },
  };
  return { ...nextState, endings: achievedEndings(nextState, beats) };
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

/** 按排序键排好的拍列表，供调度器与仿真使用。 */
export function orderedBeats(beats: Beat[]): Beat[] {
  return [...beats].sort(compareBeats);
}

export type { Ending };
