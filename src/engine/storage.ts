import { migrateContext, normalizeArchive } from "./archive";
import { isContextSection } from "./contextSections";
import { availableBeat, isRoot } from "./scheduler";
import type { Beat, Channel, EngineState, Ritual } from "./types";

// GitHub Pages repositories under one account share an origin and localStorage.
const saveNamespace = import.meta.env.VITE_SAVE_NAMESPACE || "shuangxian";
const KEY = `${saveNamespace}.progress.v2`;
const LEGACY_KEY = `${saveNamespace}.progress.v1`;

let loadNotice: string | null = null;

/** 存档不兼容时给玩家一句明确说明，而不是静默清档。 */
export function consumeLoadNotice(): string | null {
  const notice = loadNotice;
  loadNotice = null;
  return notice;
}

export function saveProgress(state: EngineState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: 2, state }));
  } catch (error) {
    console.error("[存档] 写入失败", error);
  }
}

export function hasProgress(): boolean {
  try { return Boolean(localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY)); }
  catch { return false; }
}

export function clearProgress(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(LEGACY_KEY);
  } catch (error) {
    console.error("[存档] 清除失败", error);
  }
}

export function loadProgress(beats: Beat[]): EngineState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      if (localStorage.getItem(LEGACY_KEY)) {
        loadNotice = "剧本已更新到第五章定稿，旧进度无法继续，已从第一幕重新开始。";
        clearProgress();
      }
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== 2 || !isRecord(parsed.state)) {
      loadNotice = "存档格式已升级，已从第一幕重新开始。";
      clearProgress();
      return null;
    }
    const state = parsed.state as EngineState;
    if (!isUsable(state, beats)) {
      loadNotice = "剧本已更新，旧进度里的节拍已不存在，已从第一幕重新开始。";
      clearProgress();
      return null;
    }
    const { activated, completed, superseded } = resumeTabletopProgress(state, beats);
    for (const beat of beats) {
      if (!isRoot(beat, beats) || completed.includes(beat.id) || activated.includes(beat.id) || superseded.has(beat.id)) continue;
      activated.push(beat.id);
    }
    const restored: EngineState = {
      ...state,
      activated,
      completed,
      pending: {
        left: state.pending.left ?? null,
        right: state.pending.right ?? null,
      },
      memories: normalizeMemories(state.memories, beats),
      chapter: normalizeChapter(state.chapter, beats),
      ritual: normalizeRitual(state.ritual),
      archive: normalizeArchive(state.archive, beats),
      context: normalizeContext(state.context),
      endings: Array.isArray(state.endings) ? state.endings.filter((id) => typeof id === "string") : [],
      error: typeof state.error === "string" ? state.error : null,
      runId: typeof state.runId === "number" ? state.runId : 0,
    };
    return migrateContext(restored, beats, channel => availableBeat(restored, channel, beats));
  } catch (error) {
    console.error("[存档] 读取失败", error);
    loadNotice = "存档读取失败，已从第一幕重新开始。";
    clearProgress();
    return null;
  }
}

/** 已经播过的到店剧情不补播新版分支，未播完的路线继续走。 */
function resumeTabletopProgress(state: EngineState, beats: Beat[]) {
  const activated = [...state.activated];
  const completed = [...state.completed];
  const superseded = new Set<string>();
  const arrived = "3.4.arrived";
  if (!beats.some(beat => beat.id === arrived)) return { activated, completed, superseded };

  if (completed.includes("3.4.1") && !completed.includes(arrived) && !activated.includes(arrived)) {
    if (state.chapter?.right >= 4 || completed.includes("3.4.2")
      || !activated.includes("3.4.2")) completed.push(arrived);
  }
  for (const original of ["3.2.2", "3.3.1"]) {
    const revised = original + "-A";
    if (completed.includes(original) || state.pending.left?.beatId === original) {
      superseded.add(revised);
    }
  }
  return { activated: activated.filter(id => !superseded.has(id)), completed, superseded };
}

function isUsable(state: EngineState, beats: Beat[]): boolean {
  const ids = new Set(beats.map((beat) => beat.id));
  if (!Array.isArray(state.completed) || !state.completed.every((id) => ids.has(id))) return false;
  if (!Array.isArray(state.activated) || !state.activated.every((id) => ids.has(id))) return false;
  if (!Array.isArray(state.messages)) return false;
  if (!isRecord(state.flags) || !isRecord(state.pending)) return false;
  for (const message of state.messages) {
    if (!isRecord(message)) return false;
    if (message.channel !== "left" && message.channel !== "right") return false;
    if (typeof message.text !== "string" || typeof message.id !== "string") return false;
    if (message.delivery !== "type" && message.delivery !== "pop" && message.delivery !== "image" && message.delivery !== "thought") return false;
  }
  for (const channel of ["left", "right"] as const) {
    const pending = state.pending[channel];
    if (pending === null || pending === undefined) continue;
    if (!isRecord(pending)) return false;
    if (pending.kind !== "lines" && pending.kind !== "choices" && pending.kind !== "reply") return false;
    if (typeof pending.beatId !== "string" || !ids.has(pending.beatId)) return false;
  }
  return true;
}

function normalizeChapter(value: unknown, beats: Beat[]): Record<Channel, number> {
  const fallback = (channel: Channel): number => {
    const chapters = beats.filter((beat) => beat.channel === channel).map((beat) => beat.chapter ?? 1);
    return chapters.length > 0 ? Math.min(...chapters) : 1;
  };
  if (!isRecord(value)) return { left: fallback("left"), right: fallback("right") };
  const left = typeof value.left === "number" ? value.left : fallback("left");
  const right = typeof value.right === "number" ? value.right : fallback("right");
  return { left, right };
}

function normalizeContext(value: unknown): EngineState["context"] {
  if (!isRecord(value)) return undefined;
  const context: NonNullable<EngineState["context"]> = {};
  if (isContextSection(value.left)) context.left = value.left;
  if (isContextSection(value.right)) context.right = value.right;
  return context;
}

function normalizeRitual(value: unknown): Record<Channel, Ritual | null> {
  const empty: Record<Channel, Ritual | null> = { left: null, right: null };
  if (!isRecord(value)) return empty;
  for (const channel of ["left", "right"] as const) {
    const item = value[channel];
    if (!isRecord(item)) continue;
    if (item.phase !== "mask" && item.phase !== "pause") continue;
    if (typeof item.until !== "number" || typeof item.from !== "number" || typeof item.to !== "number") continue;
    empty[channel] = {
      from: item.from,
      to: item.to,
      ...(isContextSection(item.contextTo) ? { contextTo: item.contextTo } : {}),
      phase: item.phase,
      until: item.until,
      ...(typeof item.startedAt === 'number' ? { startedAt: item.startedAt } : {}),
    };
  }
  return empty;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** 旧存档没有记忆池时补空池，带脏数据时清成空池。 */
function normalizeMemories(value: unknown, beats: Beat[]): EngineState["memories"] {
  const empty = { left: [], right: [] };
  if (!isRecord(value)) return empty;
  const pick = (list: unknown) =>
    Array.isArray(list) && list.every((item) => isRecord(item) && typeof item.label === "string")
      ? list.map((item) => item as { label: string; text: string; beatId: string })
      : [];
  const current = (list: unknown, channel: Channel) => pick(list).filter(memory => {
    const beat = beats.find(item => item.id === memory.beatId && item.channel === channel);
    if (beat?.chapter === 1 && beat.记忆候选 && memory.label === "店的位置") {
      return beat.记忆候选?.some(candidate => candidate.缩略标签 === memory.label && candidate.短句 === memory.text);
    }
    // The CH5 overlay retires two old candidates while keeping their dialogue.
    if (beat?.chapter !== 5) return true;
    return beat.记忆候选?.some(candidate => candidate.缩略标签 === memory.label);
  });
  return { left: current(value.left, "left"), right: current(value.right, "right") };
}
