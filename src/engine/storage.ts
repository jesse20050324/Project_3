import { isRoot } from "./scheduler";
import type { Beat, Channel, EngineState, Ritual } from "./types";

const KEY = "shuangxian.progress.v2";
const LEGACY_KEY = "shuangxian.progress.v1";

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
    const activated = [...state.activated];
    for (const beat of beats) {
      if (!isRoot(beat, beats) || state.completed.includes(beat.id) || activated.includes(beat.id)) continue;
      activated.push(beat.id);
    }
    return {
      ...state,
      activated,
      pending: {
        left: state.pending.left ?? null,
        right: state.pending.right ?? null,
      },
      memories: normalizeMemories(state.memories),
      chapter: normalizeChapter(state.chapter, beats),
      ritual: normalizeRitual(state.ritual),
      endings: Array.isArray(state.endings) ? state.endings.filter((id) => typeof id === "string") : [],
      error: typeof state.error === "string" ? state.error : null,
      runId: typeof state.runId === "number" ? state.runId : 0,
    };
  } catch (error) {
    console.error("[存档] 读取失败", error);
    loadNotice = "存档读取失败，已从第一幕重新开始。";
    clearProgress();
    return null;
  }
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
      phase: item.phase,
      until: item.until,
    };
  }
  return empty;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** 旧存档没有记忆池时补空池，带脏数据时清成空池。 */
function normalizeMemories(value: unknown): EngineState["memories"] {
  const empty = { left: [], right: [] };
  if (!isRecord(value)) return empty;
  const pick = (list: unknown) =>
    Array.isArray(list) && list.every((item) => isRecord(item) && typeof item.label === "string")
      ? list.map((item) => item as { label: string; text: string; beatId: string })
      : [];
  return { left: pick(value.left), right: pick(value.right) };
}
