import YAML from "js-yaml";
import chapter1Source from "../../content/chapter-01.yaml?raw";
import chapter3Source from "../../content/chapter-03.yaml?raw";
import chapter4Source from "../../content/chapter-04.yaml?raw";
import chapter5Source from "../../content/chapter-05.yaml?raw";
import chapter6Source from "../../content/chapter-06.yaml?raw";
import chapter7Source from "../../content/chapter-07.yaml?raw";
import { pacingError, resolveTiming } from "../presentation";
import type {
  Beat, Channel, Choice, Delivery, Ending, Line, MemoryCandidate,
  PacingValue, Scalar, Script, Speaker, WindowGate,
} from "./types";
import { assignSchedule } from "./timeline";
import { validateScript, type Validation } from "./validate";

// 按播放顺序读入各章，合成一份再检查。后一章的 requires 仍可指向前一章，旗标也不按章清掉。
// 旧第二章（到店）已并入第三章，幕号2作废空缺。
const bundledChapters = [chapter1Source, chapter3Source, chapter4Source, chapter5Source, chapter6Source, chapter7Source];

// 严格字段白名单：剧本里写了引擎不认识的字段必须当场报错，
// 不能再像 v3 时代那样静默丢弃（第五章 v5.1 的 时间轴/等待/分叉/终局 就是这么丢掉的）。
const TOP_KEYS = ["title", "chapter", "speakers", "beats", "时间轴", "默认节拍", "endings"];
const SPEAKER_KEYS = ["id", "name", "channel"];
const BEAT_KEYS = [
  "id", "channel", "requires", "when", "aside", "lines", "choices", "next",
  "记忆候选", "清空记忆", "chapter", "order", "sortKey", "time", "timeRank",
  "label", "window", "ending", "节拍", "control",
];
const LINE_KEYS = ["from", "text", "delivery", "caption", "节拍", "timing"];
const CHOICE_KEYS = ["thought", "reply", "set", "next", "需记忆", "节拍", "timing"];
const CANDIDATE_KEYS = ["缩略标签", "短句", "类型", "线"];
const WINDOW_KEYS = ["channel", "下界", "上界", "说明"];
const ENDING_KEYS = ["id", "title", "requires", "set"];

export function loadBundledScript(): { script: Script | null; error: string | null } {
  try {
    const script = mergeChapters(bundledChapters.map((source) => parseScript(source)));
    const result = validateScript(script);
    if (!result.ok) return { script: null, error: result.error };
    return { script, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "剧本无法解析";
    return { script: null, error: message };
  }
}

function mergeChapters(parts: Script[]): Script {
  const beats = parts.flatMap((part, index) => {
    const chapter = part.chapters?.[0]?.index ?? index + 1;
    return part.beats.map((beat) => ({ ...beat, chapter: beat.chapter ?? chapter }));
  });
  const axes: Record<number, string[]> = {};
  for (const part of parts) {
    for (const [chapter, labels] of Object.entries(part.axes ?? {})) axes[Number(chapter)] = labels;
  }
  const script: Script = {
    title: parts[0]?.title ?? "",
    speakers: parts[0]?.speakers ?? [],
    beats,
    chapters: parts.map((part, index) => ({
      index: part.chapters?.[0]?.index ?? index + 1,
      title: part.title,
    })),
    axes,
    endings: parts.flatMap((part) => part.endings ?? []),
    默认节拍: parts.find((part) => part.默认节拍)?.默认节拍,
  };
  return assignSchedule(script);
}

export function parseScript(source: string): Script {
  const data: unknown = YAML.load(source);
  if (!isRecord(data)) throw new Error("剧本不是一个对象");
  checkUnknown(data, TOP_KEYS, "剧本顶层");
  const title = readString(data.title, "剧本缺少标题");
  const chapter = readChapter(data.chapter);
  const speakers = readSpeakers(data.speakers);
  const axis = data.时间轴 === undefined ? undefined : readStringList(data.时间轴, "时间轴");
  const 默认节拍 = data.默认节拍 === undefined ? undefined : readPacing(data.默认节拍, "剧本默认节拍");
  const chapterPace = typeof 默认节拍 === "string" ? 默认节拍 : undefined;
  const endings = data.endings === undefined ? undefined : readEndings(data.endings);
  const beats = readBeats(data.beats, chapterPace).map((beat) =>
    chapter === undefined ? beat : { ...beat, chapter },
  );
  return {
    title,
    speakers,
    beats,
    chapters: chapter === undefined ? undefined : [{ index: chapter, title }],
    axes: chapter !== undefined && axis ? { [chapter]: axis } : undefined,
    endings,
    默认节拍: typeof 默认节拍 === "string" ? 默认节拍 : undefined,
  };
}

export function nameOf(script: Script, id: string): string {
  return script.speakers.find((speaker) => speaker.id === id)?.name ?? id;
}

export function humanOn(script: Script, channel: Channel): Speaker | undefined {
  return script.speakers.find((speaker) => speaker.channel === channel);
}

function checkUnknown(value: Record<string, unknown>, allowed: string[], where: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new Error(`${where} 有引擎不认识的字段：${unknown.join("、")}。若剧本新增了结构，先扩 src/engine 的字段契约，不要让它被静默丢弃。`);
  }
}

function readSpeakers(value: unknown): Speaker[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("剧本缺少人物表");
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`第 ${index + 1} 个人物无法读取`);
    checkUnknown(item, SPEAKER_KEYS, `第 ${index + 1} 个人物`);
    const id = readString(item.id, `第 ${index + 1} 个人物缺少 id`);
    const name = readString(item.name, `人物 ${id} 缺少名字`);
    const channel = item.channel === undefined ? undefined : readChannel(item.channel, id);
    return { id, name, channel };
  });
}

function readBeats(value: unknown, chapterPace: string | undefined): Beat[] {
  if (!Array.isArray(value)) throw new Error("剧本缺少 beats");
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`第 ${index + 1} 个节拍无法读取`);
    const id = readString(item.id, `第 ${index + 1} 个节拍缺少 id`);
    checkUnknown(item, BEAT_KEYS, `节拍 ${id}`);
    const channel = readChannel(item.channel, id);
    if (item.control !== undefined && typeof item.control !== "boolean") {
      throw new Error(`节拍 ${id} 的 control 必须为布尔值`);
    }
    const beatPace = item.节拍 === undefined ? undefined : readPacing(item.节拍, `节拍 ${id} 的 节拍`);
    const chain: (PacingValue | undefined)[] = [chapterPace, beatPace];
    const lines = readLines(item.lines, id, chain);
    const choices = item.choices === undefined ? undefined : readChoices(item.choices, id, chain);
    const requires = item.requires === undefined ? undefined : readIdList(item.requires, id, "requires");
    const when = item.when === undefined ? undefined : readFlags(item.when, id);
    const aside = item.aside === undefined ? undefined : readString(item.aside, `节拍 ${id} 的自言自语无法读取`);
    const next = item.next === undefined ? undefined : readString(item.next, `节拍 ${id} 的 next 无法读取`);
    const 记忆候选 = item.记忆候选 === undefined ? undefined : readMemoryCandidates(item.记忆候选, id);
    const 清空记忆 = item.清空记忆 === undefined ? undefined : readWipe(item.清空记忆, id);
    const order = item.order === undefined ? undefined : readNonNegativeInt(item.order, `节拍 ${id} 的 order`);
    const time = item.time === undefined ? undefined : readString(item.time, `节拍 ${id} 的 time 无法读取`);
    const timeRank = item.timeRank === undefined ? undefined : readNonNegativeInt(item.timeRank, `节拍 ${id} 的 timeRank`);
    const label = item.label === undefined ? undefined : readString(item.label, `节拍 ${id} 的 label 无法读取`);
    const window = item.window === undefined ? undefined : readWindow(item.window, id);
    const ending = item.ending === undefined ? undefined : readString(item.ending, `节拍 ${id} 的 ending 无法读取`);
    const sortKey = item.sortKey === undefined ? undefined : readNonNegativeInt(item.sortKey, `节拍 ${id} 的 sortKey`);
    const chapter = item.chapter === undefined ? undefined : readChapter(item.chapter);
    return {
      id, channel, control: item.control as boolean | undefined, lines, choices, requires, when, aside, next, 记忆候选, 清空记忆,
      order, time, timeRank, label, window, ending, sortKey, chapter,
      ...(beatPace !== undefined ? { 节拍: beatPace } : {}),
    };
  });
}

function readMemoryCandidates(value: unknown, beatId: string): MemoryCandidate[] {
  if (!Array.isArray(value)) throw new Error(`节拍 ${beatId} 的记忆候选无法读取`);
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`节拍 ${beatId} 的第 ${index + 1} 条记忆候选无法读取`);
    checkUnknown(item, CANDIDATE_KEYS, `节拍 ${beatId} 的第 ${index + 1} 条记忆候选`);
    return {
      缩略标签: readString(item.缩略标签, `节拍 ${beatId} 的第 ${index + 1} 条记忆候选缺少缩略标签`),
      短句: readString(item.短句, `节拍 ${beatId} 的第 ${index + 1} 条记忆候选缺少短句`),
      类型: item.类型 === undefined ? undefined : readString(item.类型, `节拍 ${beatId} 的记忆候选类型无法读取`),
      线: item.线 === undefined ? undefined : readString(item.线, `节拍 ${beatId} 的记忆候选线无法读取`),
    };
  });
}

function readWipe(value: unknown, beatId: string): Beat["清空记忆"] {
  if (value === "all" || value === "left" || value === "right") return value;
  throw new Error(`节拍 ${beatId} 的清空记忆只能是 all、left 或 right`);
}

function readWindow(value: unknown, beatId: string): WindowGate {
  if (!isRecord(value)) throw new Error(`节拍 ${beatId} 的 window 无法读取`);
  checkUnknown(value, WINDOW_KEYS, `节拍 ${beatId} 的 window`);
  const channel = readChannel(value.channel, `节拍 ${beatId} 的 window`);
  const 下界 = value.下界 === undefined ? [] : readIdList(value.下界, beatId, "window.下界");
  const 上界 = readIdList(value.上界, beatId, "window.上界");
  const 说明 = value.说明 === undefined ? undefined : readString(value.说明, `节拍 ${beatId} 的 window.说明 无法读取`);
  return { channel, 下界, 上界, ...(说明 ? { 说明 } : {}) };
}

function readEndings(value: unknown): Ending[] {
  if (!Array.isArray(value)) throw new Error("endings 必须是列表");
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`第 ${index + 1} 个 endings 无法读取`);
    checkUnknown(item, ENDING_KEYS, `第 ${index + 1} 个 endings`);
    const id = readString(item.id, `第 ${index + 1} 个 endings 缺少 id`);
    return {
      id,
      title: readString(item.title, `终局 ${id} 缺少 title`),
      requires: readIdList(item.requires, id, "终局 requires"),
      set: item.set === undefined ? undefined : readFlags(item.set, id),
    };
  });
}

function readLines(value: unknown, beatId: string, chain: (PacingValue | undefined)[]): Line[] {
  if (!Array.isArray(value)) throw new Error(`节拍 ${beatId} 缺少台词`);
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`节拍 ${beatId} 的第 ${index + 1} 句无法读取`);
    checkUnknown(item, LINE_KEYS, `节拍 ${beatId} 的第 ${index + 1} 句`);
    const from = readString(item.from, `节拍 ${beatId} 的第 ${index + 1} 句缺少说话人`);
    const text = readString(item.text, `节拍 ${beatId} 的第 ${index + 1} 句缺少文字`);
    const delivery = readDelivery(item.delivery, beatId);
    const caption = item.caption === undefined ? undefined : readString(item.caption, `节拍 ${beatId} 的图说无法读取`);
    const 节拍 = item.节拍 === undefined ? undefined : readPacing(item.节拍, `节拍 ${beatId} 的第 ${index + 1} 句 节拍`);
    return {
      from, text, delivery,
      ...(caption !== undefined ? { caption } : {}),
      ...(节拍 !== undefined ? { 节拍 } : {}),
      timing: resolveTiming([...chain, 节拍]),
    };
  });
}

function readChoices(value: unknown, beatId: string, chain: (PacingValue | undefined)[]): Choice[] {
  if (!Array.isArray(value)) throw new Error(`节拍 ${beatId} 的选项无法读取`);
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`节拍 ${beatId} 的第 ${index + 1} 个选项无法读取`);
    checkUnknown(item, CHOICE_KEYS, `节拍 ${beatId} 的第 ${index + 1} 个选项`);
    const thought = readString(item.thought, `节拍 ${beatId} 的第 ${index + 1} 个想法是空的`);
    const reply = readString(item.reply, `节拍 ${beatId} 的第 ${index + 1} 个回复是空的`);
    const next = item.next === undefined ? undefined : readString(item.next, `节拍 ${beatId} 的选项 next 无法读取`);
    const set = item.set === undefined ? undefined : readFlags(item.set, beatId);
    const 需记忆 = item.需记忆 === undefined ? undefined : readString(item.需记忆, `节拍 ${beatId} 的需记忆无法读取`);
    const 节拍 = item.节拍 === undefined ? undefined : readPacing(item.节拍, `节拍 ${beatId} 的第 ${index + 1} 个选项 节拍`);
    return {
      thought, reply,
      ...(next !== undefined ? { next } : {}),
      ...(set !== undefined ? { set } : {}),
      ...(需记忆 !== undefined ? { 需记忆 } : {}),
      ...(节拍 !== undefined ? { 节拍 } : {}),
      timing: resolveTiming([...chain, 节拍]),
    };
  });
}

function readPacing(value: unknown, where: string): PacingValue {
  const problem = pacingError(value as PacingValue);
  if (problem) throw new Error(`${where}：${problem}`);
  return value as PacingValue;
}

function readFlags(value: unknown, beatId: string): Record<string, Scalar> {
  if (!isRecord(value)) throw new Error(`节拍 ${beatId} 的旗标无法读取`);
  const flags: Record<string, Scalar> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string" && typeof entry !== "number" && typeof entry !== "boolean") {
      throw new Error(`节拍 ${beatId} 的旗标 ${key} 只能是文字、数字或是否`);
    }
    flags[key] = entry;
  }
  return flags;
}

function readIdList(value: unknown, beatId: string, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`节拍 ${beatId} 的 ${label} 必须是 id 列表`);
  }
  return value as string[];
}

function readStringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} 必须是文字列表`);
  }
  return value as string[];
}

function readChannel(value: unknown, id: string): Channel {
  if (value !== "left" && value !== "right") {
    throw new Error(`${id} 的 channel 必须是 left 或 right`);
  }
  return value;
}

function readDelivery(value: unknown, beatId: string): Delivery {
  if (value !== "type" && value !== "pop" && value !== "image" && value !== "thought") {
    throw new Error(`节拍 ${beatId} 的呈现方式必须是 type、pop、image 或 thought`);
  }
  return value;
}

function readNonNegativeInt(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} 必须是非负整数`);
  }
  return value;
}

function readChapter(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error("chapter 必须是从 1 开始的整数");
  }
  return value;
}

function readString(value: unknown, message: string): string {
  if (typeof value !== "string") throw new Error(message);
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validationError(result: Validation): string | null {
  return result.ok ? null : result.error;
}
