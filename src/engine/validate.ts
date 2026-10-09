import type { Beat, Channel, Delivery, Scalar, Script } from "./types";

export type Validation =
  | { ok: true }
  | { ok: false; error: string };

const DELIVERIES: Delivery[] = ["type", "pop", "image", "thought"];

export function validateScript(script: Script): Validation {
  const errors: string[] = [];
  const ids = script.beats.map((beat) => beat.id);
  const seen = new Set<string>();

  if (script.beats.length === 0) {
    errors.push("剧本里没有任何节拍。");
  }

  for (const id of ids) {
    if (!id.trim()) {
      errors.push("有节拍缺少 id。");
      continue;
    }
    if (seen.has(id)) {
      errors.push(`节拍 id 重复：${id}`);
    }
    seen.add(id);
  }

  const byId = new Map<string, Beat>();
  for (const beat of script.beats) {
    if (!byId.has(beat.id)) byId.set(beat.id, beat);
  }

  const speakerIds = new Set<string>();
  for (const speaker of script.speakers) {
    if (speakerIds.has(speaker.id)) {
      errors.push(`人物 id 重复：${speaker.id}`);
    }
    speakerIds.add(speaker.id);
    if (speaker.channel && speaker.channel !== "left" && speaker.channel !== "right") {
      errors.push(`人物 ${speaker.id} 的侧栏不是 left 或 right。`);
    }
  }

  const cycle = findRequiresCycle(script.beats);
  if (cycle) {
    errors.unshift(
      `节拍依赖成环：${cycle.join(" → ")}。这会让玩家一直等下去，剧本不能开始。`,
    );
  }

  for (const beat of script.beats) {
    if (beat.channel !== "left" && beat.channel !== "right") {
      errors.push(`节拍 ${beat.id} 的 channel 必须是 left 或 right。`);
    }
    if (beat.lines.length === 0) {
      errors.push(`节拍 ${beat.id} 没有任何台词。`);
    }
    if (beat.choices && beat.choices.length > 0 && beat.next) {
      errors.push(`节拍 ${beat.id} 已经有选项，就不能再写节拍上的 next。`);
    }

    for (const requireId of beat.requires ?? []) {
      if (!byId.has(requireId)) {
        errors.push(`节拍 ${beat.id} 的 requires「${requireId}」不存在。`);
      }
    }

    if (beat.when) {
      for (const [key, value] of Object.entries(beat.when)) {
        if (!key.trim()) errors.push(`节拍 ${beat.id} 的 when 有一个空旗标名。`);
        if (!isScalar(value)) errors.push(`节拍 ${beat.id} 的 when.${key} 只能是文字、数字或是否。`);
      }
    }

    for (const line of beat.lines) {
      if (!line.text.trim()) {
        errors.push(`节拍 ${beat.id} 有一句空台词。`);
      }
      if (!DELIVERIES.includes(line.delivery)) {
        errors.push(`节拍 ${beat.id} 的呈现方式无法识别：${String(line.delivery)}`);
      }
      const speaker = script.speakers.find((item) => item.id === line.from);
      if (!speaker) {
        errors.push(`节拍 ${beat.id} 的说话人「${line.from}」不在人物表里。`);
      } else if (speaker.channel && speaker.channel !== beat.channel) {
        errors.push(
          `节拍 ${beat.id} 在${channelName(beat.channel)}，却写了${speaker.name}的台词。`,
        );
      }
    }

    for (const choice of beat.choices ?? []) {
      if (!choice.thought.trim()) {
        errors.push(`节拍 ${beat.id} 有一个空的想法。`);
      }
      if (!choice.reply.trim()) {
        errors.push(`节拍 ${beat.id} 有一个选项没有写死回复。`);
      }
      if (choice.set) {
        for (const [key, value] of Object.entries(choice.set)) {
          if (!isScalar(value)) {
            errors.push(`节拍 ${beat.id} 的旗标 ${key} 只能是文字、数字或是否。`);
          }
        }
      }
      checkLink(errors, byId, beat, choice.next, "选项");
    }

    if (!beat.choices?.length) {
      checkLink(errors, byId, beat, beat.next, "next");
    }
  }

  if (errors.length > 0) {
    return { ok: false, error: errors.join("\n") };
  }
  return { ok: true };
}

function checkLink(
  errors: string[],
  byId: Map<string, Beat>,
  beat: Beat,
  next: string | undefined,
  label: string,
) {
  if (!next) return;
  const target = byId.get(next);
  if (!target) {
    errors.push(`节拍 ${beat.id} 的${label}指向不存在的「${next}」。`);
    return;
  }
  if (target.channel !== beat.channel) {
    errors.push(
      `节拍 ${beat.id} 在${channelName(beat.channel)}，${label}却指向另一侧的「${next}」。`,
    );
  }
}

function isScalar(value: unknown): value is Scalar {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

export function channelName(channel: Channel): string {
  return channel === "left" ? "左侧" : "右侧";
}

function findRequiresCycle(beats: Beat[]): string[] | null {
  const byId = new Map(beats.map((beat) => [beat.id, beat]));
  const color = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];

  const visit = (id: string): string[] | null => {
    color.set(id, 1);
    stack.push(id);
    for (const dep of byId.get(id)?.requires ?? []) {
      if (!byId.has(dep)) continue;
      const state = color.get(dep) ?? 0;
      if (state === 1) {
        const start = stack.indexOf(dep);
        return [...stack.slice(start), dep];
      }
      if (state === 0) {
        const found = visit(dep);
        if (found) return found;
      }
    }
    stack.pop();
    color.set(id, 2);
    return null;
  };

  for (const beat of beats) {
    if ((color.get(beat.id) ?? 0) === 0) {
      const found = visit(beat.id);
      if (found) return found;
    }
  }
  return null;
}
