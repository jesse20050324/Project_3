import { pacingError } from "../presentation";
import { scheduleOf } from "./timeline";
import type { Beat, Channel, Delivery, PacingValue, Scalar, Script } from "./types";

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

  // 置灰门引用的缩略标签必须真的有候选可存，否则选项永远选不了。
  const memoryLabels = new Set(
    script.beats.flatMap((beat) => (beat.记忆候选 ?? []).map((candidate) => candidate.缩略标签)),
  );
  for (const beat of script.beats) {
    for (const choice of beat.choices ?? []) {
      for (const route of choice.记忆后继 ?? []) {
        if (!route.all.length || route.all.some(label => !script.beats.some(source =>
          source.channel === beat.channel && source.记忆候选?.some(candidate => candidate.缩略标签 === label)))) {
          errors.push(`节拍 ${beat.id} 的记忆后继需要本窗有效候选。`);
        }
        if (!route.next) errors.push(`节拍 ${beat.id} 的记忆后继缺少目标。`);
        checkLink(errors, byId, beat, route.next, "记忆后继");
      }
      if (choice.next && choice.记忆后继) errors.push(`节拍 ${beat.id} 的选项同时声明固定后继与记忆后继。`);
      if (choice.需记忆 && !memoryLabels.has(choice.需记忆)) {
        errors.push(`节拍 ${beat.id} 的选项「${choice.thought}」需要记忆「${choice.需记忆}」，但没有任何节拍提供这条候选。`);
      }
    }
  }

  // 显式写了 order 的章，序号必须唯一：排序键是唯一真相，重复会让「谁先谁后」不确定。
  // 旧章 / 合成测试剧本没有 order，交给 timeline 按文件顺序补，不参与这项检查。
  const orderOwner = new Map<string, string>();
  for (const beat of script.beats) {
    if (beat.order === undefined) continue;
    const key = `${beat.chapter ?? 0}:${beat.order}`;
    if (orderOwner.has(key)) {
      errors.push(`节拍 ${orderOwner.get(key)} 与 ${beat.id} 的章内序号重复（${key}），播出顺序会不确定。`);
    } else {
      orderOwner.set(key, beat.id);
    }
  }

  const endingIds = new Set((script.endings ?? []).map((ending) => ending.id));
  for (const ending of script.endings ?? []) {
    for (const need of ending.requires) {
      if (!byId.has(need)) errors.push(`终局「${ending.id}」要求的拍「${need}」不存在。`);
    }
    if (ending.requires.length === 0) {
      errors.push(`终局「${ending.id}」没有写 requires，永远无法判定达成。`);
    }
  }

  for (const beat of script.beats) {
    if (beat.channel !== "left" && beat.channel !== "right") {
      errors.push(`节拍 ${beat.id} 的 channel 必须是 left 或 right。`);
    }
    if (beat.lines.length === 0 && !beat.control) {
      errors.push(`节拍 ${beat.id} 没有任何台词。`);
    }
    if (beat.control && (beat.lines.length > 0 || beat.choices?.length)) {
      errors.push(`控制拍 ${beat.id} 不能含台词或玩家选项。`);
    }
    if (beat.choices && beat.choices.length > 0 && beat.next) {
      errors.push(`节拍 ${beat.id} 已经有选项，就不能再写节拍上的 next。`);
    }

    validateTiming(errors, beat.节拍, `节拍 ${beat.id} 的 节拍`);
    for (const line of beat.lines) {
      validateTiming(errors, line.节拍, `节拍 ${beat.id} 的台词 节拍`);
    }
    for (const choice of beat.choices ?? []) {
      validateTiming(errors, choice.节拍, `节拍 ${beat.id} 的选项 节拍`);
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

    validateTime(errors, beat, script);
    validateWindow(errors, beat, byId);

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

    // 记忆候选的短句必须一字不差出现在本拍的台词或回复里，
    // 否则高亮不会出现、候选存不进、引用它的置灰门会永远锁死。
    for (const candidate of beat.记忆候选 ?? []) {
      if (!candidate.短句.trim()) {
        errors.push(`节拍 ${beat.id} 的记忆候选「${candidate.缩略标签}」缺少短句。`);
        continue;
      }
      const corpus = [
        ...beat.lines.map((line) => line.text),
        ...(beat.choices ?? []).map((choice) => choice.reply),
      ].join("\n");
      if (!corpus.includes(candidate.短句)) {
        errors.push(`节拍 ${beat.id} 的记忆候选「${candidate.缩略标签}」的短句没有出现在本拍的台词或回复里，玩家存不进这条记忆。`);
      }
    }

    if (beat.ending !== undefined && !endingIds.has(beat.ending)) {
      errors.push(`节拍 ${beat.id} 声明终局「${beat.ending}」，但剧本没有在 endings 里声明它。`);
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

function validateTiming(errors: string[], value: PacingValue | undefined, where: string): void {
  if (value === undefined) return;
  const problem = pacingError(value);
  if (problem) errors.push(`${where}：${problem}`);
}

function validateTime(errors: string[], beat: Beat, script: Script): void {
  if (beat.time === undefined) return;
  const axis = script.axes?.[beat.chapter ?? 0];
  if (!axis) {
    errors.push(`节拍 ${beat.id} 写了 time「${beat.time}」，但第 ${beat.chapter ?? 0} 章没有顶层 时间轴。`);
    return;
  }
  const rank = axis.indexOf(beat.time);
  if (rank < 0) {
    errors.push(`节拍 ${beat.id} 的 time「${beat.time}」不在第 ${beat.chapter ?? 0} 章的时间轴里（必须一字不差）。`);
  } else if (beat.timeRank !== undefined && beat.timeRank !== rank) {
    errors.push(`节拍 ${beat.id} 的 timeRank=${beat.timeRank} 与时间轴下标 ${rank} 不一致。`);
  }
}

function validateWindow(errors: string[], beat: Beat, byId: Map<string, Beat>): void {
  const gate = beat.window;
  if (!gate) return;
  if (gate.上界.length === 0) {
    errors.push(`节拍 ${beat.id} 的区间门没有上界，「超出区间就出错」无从判定。`);
  }
  const other: Channel = beat.channel === "left" ? "right" : "left";
  if (gate.channel !== other) {
    errors.push(`节拍 ${beat.id} 在${channelName(beat.channel)}，区间门却度量了同侧（${gate.channel}）。`);
  }
  for (const [label, bounds] of [["下界", gate.下界], ["上界", gate.上界]] as const) {
    for (const id of bounds) {
      const target = byId.get(id);
      if (!target) {
        errors.push(`节拍 ${beat.id} 的区间${label}「${id}」不存在。`);
        continue;
      }
      if (target.channel !== gate.channel) {
        errors.push(`节拍 ${beat.id} 的区间${label}「${id}」不在被度量的对侧 ${gate.channel}。`);
      }
      if (label === "下界" && scheduleOf(target) >= scheduleOf(beat)) {
        errors.push(`节拍 ${beat.id} 的区间下界「${id}」不早于本拍，区间永远无法成立。`);
      }
      if (label === "上界" && scheduleOf(target) <= scheduleOf(beat)) {
        errors.push(`节拍 ${beat.id} 的区间上界「${id}」不晚于本拍，区间会被提前关闭。`);
      }
    }
  }
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
