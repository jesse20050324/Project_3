import type { Beat, Script } from "./types";

/**
 * 时序的唯一真相。
 * 剧本顺序、区间门、对侧进度都在这里算；运行时调度与穷举仿真共用，
 * 不再出现「出图一套排序、播放另一套排序」的历史问题。
 *
 * 排序键 = 章号 × 10^6 + 章内序号。章内序号优先取剧本显式写的 order
 * （第五章由 tools/ch5-timing.yaml 的「拍序」生成），旧章缺省则按文件顺序。
 */

const CHAPTER_STRIDE = 1_000_000;

export type WindowState = "none" | "waiting" | "open" | "closed";

export function scheduleOf(beat: Beat): number {
  if (beat.sortKey !== undefined) return beat.sortKey;
  return (beat.chapter ?? 0) * CHAPTER_STRIDE + (beat.order ?? 0);
}

export function compareBeats(a: Beat, b: Beat): number {
  const delta = scheduleOf(a) - scheduleOf(b);
  if (delta !== 0) return delta;
  return a.id.localeCompare(b.id, "zh-Hans-CN");
}

/** 加载期一次性预计算排序键、时间档下标与索引，运行时只做 O(k) 候选遍历。 */
export function assignSchedule(script: Script): Script {
  const nextLocalOrder = new Map<number, number>();
  const beats = script.beats.map((beat) => {
    const chapter = beat.chapter ?? 0;
    const localIndex = nextLocalOrder.get(chapter) ?? 0;
    nextLocalOrder.set(chapter, localIndex + 1);
    const axis = script.axes?.[chapter];
    const timeRank = beat.timeRank
      ?? (beat.time && axis ? axis.indexOf(beat.time) : undefined);
    return {
      ...beat,
      order: beat.order ?? localIndex,
      sortKey: chapter * CHAPTER_STRIDE + (beat.order ?? localIndex),
      ...(timeRank !== undefined && timeRank >= 0 ? { timeRank } : {}),
    };
  });
  const orderedBeats = [...beats].sort(compareBeats);
  return {
    ...script,
    beats,
    orderedBeats,
    beatById: new Map(beats.map((beat) => [beat.id, beat])),
  };
}

/**
 * 区间门判定。
 * - waiting：对侧还没走到下界（严格先后，等价于等待门）
 * - open：落在区间内，此时与对侧谁先谁后无所谓
 * - closed：上界已被越过，本拍不能再播；若它仍未完成，就是「顺序反了」的逻辑错误
 */
export function windowState(beat: Beat, completed: Set<string>): WindowState {
  const gate = beat.window;
  if (!gate) return "none";
  if (gate.下界.length > 0 && !gate.下界.some((id) => completed.has(id))) return "waiting";
  if (gate.上界.some((id) => completed.has(id))) return "closed";
  return "open";
}

/** 区间越界的可行动报错，供仿真与运行时校验使用。 */
export function windowViolation(beat: Beat, completed: Set<string>): string | null {
  if (windowState(beat, completed) !== "closed") return null;
  if (completed.has(beat.id)) return null;
  const closedBy = beat.window?.上界.filter((id) => completed.has(id)) ?? [];
  return `区间越界：拍 ${beat.id} 应在对侧 ${beat.window?.下界.join("/") || "起点"} 与 ${closedBy.join("/")} 之间播出，但 ${closedBy.join("/")} 已完成`;
}

/** 按排序键排序的「下一个候选」列表，供调度器与仿真共用。 */
export function sortedCandidates(beats: Beat[]): Beat[] {
  return [...beats].sort(compareBeats);
}
