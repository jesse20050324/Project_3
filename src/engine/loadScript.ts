import YAML from "js-yaml";
import chapterSource from "../../content/chapter-01.yaml?raw";
import type { Beat, Channel, Choice, Delivery, Line, Scalar, Script, Speaker } from "./types";
import { validateScript, type Validation } from "./validate";

export function loadBundledScript(): { script: Script | null; error: string | null } {
  try {
    const script = parseScript(chapterSource);
    const result = validateScript(script);
    if (!result.ok) return { script: null, error: result.error };
    return { script, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "剧本无法解析";
    return { script: null, error: message };
  }
}

export function parseScript(source: string): Script {
  const data = YAML.load(source);
  if (!isRecord(data)) throw new Error("剧本不是一个对象");
  const title = readString(data.title, "剧本缺少标题");
  const speakers = readSpeakers(data.speakers);
  const beats = readBeats(data.beats);
  return { title, speakers, beats };
}

export function nameOf(script: Script, id: string): string {
  return script.speakers.find((speaker) => speaker.id === id)?.name ?? id;
}

export function humanOn(script: Script, channel: Channel): Speaker | undefined {
  return script.speakers.find((speaker) => speaker.channel === channel);
}

function readSpeakers(value: unknown): Speaker[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("剧本缺少人物表");
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`第 ${index + 1} 个人物无法读取`);
    const id = readString(item.id, `第 ${index + 1} 个人物缺少 id`);
    const name = readString(item.name, `人物 ${id} 缺少名字`);
    const channel = item.channel === undefined ? undefined : readChannel(item.channel, id);
    return { id, name, channel };
  });
}

function readBeats(value: unknown): Beat[] {
  if (!Array.isArray(value)) throw new Error("剧本缺少 beats");
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`第 ${index + 1} 个节拍无法读取`);
    const id = readString(item.id, `第 ${index + 1} 个节拍缺少 id`);
    const channel = readChannel(item.channel, id);
    const lines = readLines(item.lines, id);
    const choices = item.choices === undefined ? undefined : readChoices(item.choices, id);
    const requires = item.requires === undefined ? undefined : readIdList(item.requires, id, "requires");
    const when = item.when === undefined ? undefined : readFlags(item.when, id);
    const aside = item.aside === undefined ? undefined : readString(item.aside, `节拍 ${id} 的自言自语无法读取`);
    const next = item.next === undefined ? undefined : readString(item.next, `节拍 ${id} 的 next 无法读取`);
    return { id, channel, lines, choices, requires, when, aside, next };
  });
}

function readLines(value: unknown, beatId: string): Line[] {
  if (!Array.isArray(value)) throw new Error(`节拍 ${beatId} 缺少台词`);
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`节拍 ${beatId} 的第 ${index + 1} 句无法读取`);
    const from = readString(item.from, `节拍 ${beatId} 的第 ${index + 1} 句缺少说话人`);
    const text = readString(item.text, `节拍 ${beatId} 的第 ${index + 1} 句缺少文字`);
    const delivery = readDelivery(item.delivery, beatId);
    const caption = item.caption === undefined ? undefined : readString(item.caption, `节拍 ${beatId} 的图说无法读取`);
    return { from, text, delivery, caption };
  });
}

function readChoices(value: unknown, beatId: string): Choice[] {
  if (!Array.isArray(value)) throw new Error(`节拍 ${beatId} 的选项无法读取`);
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`节拍 ${beatId} 的第 ${index + 1} 个选项无法读取`);
    const thought = readString(item.thought, `节拍 ${beatId} 的第 ${index + 1} 个想法是空的`);
    const reply = readString(item.reply, `节拍 ${beatId} 的第 ${index + 1} 个回复是空的`);
    const next = item.next === undefined ? undefined : readString(item.next, `节拍 ${beatId} 的选项 next 无法读取`);
    const set = item.set === undefined ? undefined : readFlags(item.set, beatId);
    return { thought, reply, next, set };
  });
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
  return value;
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
