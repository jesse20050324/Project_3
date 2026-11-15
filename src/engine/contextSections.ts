import type { Beat, EngineState } from "./types";

export const contextTitles = [
  "桌游聚会", "加微信后", "约见与表白", "交往第一天", "第一次争执",
  "周日见面", "纪念日改约", "楼下的争执", "争执之后",
] as const;

export type ContextSection = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

const retainedTimeGroups = 5;
const earlyClearStarts = new Set(["3.4.1", "4.1.1", "6m.M5"]);

export function retainRecentChat(state: EngineState, upcoming: Beat, beats: Beat[]): EngineState {
  const { channel } = upcoming;
  if (!upcoming.context || upcoming.control) return state;
  const local = state.messages.filter(message => message.channel === channel);
  if (!local.length) return state;
  const byId = new Map(beats.map(beat => [beat.id, beat]));
  let groups = 1;
  let nextTime = upcoming.context.time;
  let cutoff = local.length;
  const clearBeforeUpcoming = earlyClearStarts.has(upcoming.id);
  for (let i = local.length - 1; i >= 0; i--) {
    const previous = byId.get(local[i].beatId);
    if (previous?.context?.section !== upcoming.context.section) break;
    if (clearBeforeUpcoming && previous.id !== upcoming.id) break;
    if (previous.context?.time !== nextTime && ++groups > retainedTimeGroups) break;
    if (earlyClearStarts.has(previous.id) && previous.id !== upcoming.id && i > 0 && local[i - 1].beatId !== previous.id) {
      cutoff = i;
      break;
    }
    nextTime = previous.context?.time;
    cutoff = i;
  }
  if (!cutoff) return state;
  const removed = new Set(local.slice(0, cutoff));
  return { ...state, messages: state.messages.filter(message => !removed.has(message)) };
}

export function isContextSection(value: unknown): value is ContextSection {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= contextTitles.length;
}

export function contextForBeat(beat: Beat): NonNullable<Beat["context"]> {
  const { id, chapter, time, channel } = beat;
  switch (chapter) {
    case 1:
      return { section: 1, time: "聚会当天 · 出发前" };
    case 3:
      return { section: 1, time: channel === "left" ? "到店前后" : id.startsWith("3.4.1") || id === "3.4.2" ? "在路上" : "到店后 · 局间" };
    case 4:
      return { section: 1, time: "散场后" };
    case 5:
      if (/^5[fm]\.3\.2$/.test(id)) return { section: 3, time: "周五 · 改期" };
      if (/^5[fm]\.3\.[34]$/.test(id)) return { section: 3, time: "周日晚 · 见面后" };
      if (/^5[fm]\.4\./.test(id)) return { section: 3, time: "见面两天后" };
      if (/^5[fm]\.3\./.test(id)) return { section: 3, time: "加微信后第 12 天 · 晚上" };
      {
        const day = time?.match(/^D(2|3|9|10|11|12)\b/)?.[1];
        if (day) return { section: 2, time: `加微信后第 ${day} 天` };
      }
      return { section: 2, time: "加微信当天" };
    case 6:
      return {
        section: 4,
        time: /^(6m\.(M5|MEMCHOICE|M7|END)|6f\.(F[678]|END))/.test(id) ? "当晚" : "交往第 1 天",
      };
    case 7:
      if (time?.includes("周日")) return { section: 6, time: / 19:/.test(time) ? "周日傍晚 · 见面后" : "周日上午" };
      if (time?.includes("周六")) return { section: 5, time: "周六晚" };
      return { section: 5, time: / 22:/.test(time ?? "") ? "聚餐结束后" : "交往第 17 天 · 周五" };
    case 8:
      if (/^8[fm]\.[FM]305G$/.test(id)) return { section: 9, time: "当晚 · 见面后" };
      if (/^8[fm]\.[FM]3/.test(id)) return { section: 9, entryTime: time };
      if (/^8[fm]\.[FM](10[5-7]|2|READY)/.test(id)) {
        return { section: 8, entryTime: time,
          ...(/^8[fm]\.[FM]2/.test(id) ? { time: channel === "left" ? "19:52" : "20:12" } : {}) };
      }
      return { section: 7, time: /^8[fm]\.[FM]10[34]$/.test(id) ? "傍晚 · 改约" : "一个月纪念日" };
    default:
      throw new Error(`未配置节拍 ${id} 的会话段`);
  }
}
