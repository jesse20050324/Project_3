#!/usr/bin/env node
// ============================================================
// 第五章单向生成器：script/ch5.yaml（定稿，只读）
//   + tools/ch5-timing.yaml（实现层 overlay）
//   → content/chapter-05.yaml（引擎实现层，生成物）
//
// 用法：
//   node tools/build-chapter.mjs          重出实现层 YAML
//   node tools/build-chapter.mjs --check  不写盘，只比对生成物是否已是最新
//
// 纪律：剧本源与 script/feishu/*.mmd 全程只读，本脚本绝不回写。
// 定稿里的 ①②③④ 原文逐字搬运，不做任何改写；剧本里只有自然语言
// 描述的「范围包含 / 节拍对位」和调参需求，由 overlay 补成机器可读字段。
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "js-yaml";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT_PATH = path.join(ROOT, "script", "ch5.yaml");
const OVERLAY_PATH = path.join(ROOT, "tools", "ch5-timing.yaml");
const OUTPUT_PATH = path.join(ROOT, "content", "chapter-05.yaml");
const CHECK = process.argv.includes("--check");

const HEADER = `# 第五幕 · 熟悉期 —— 由 script/ch5.yaml（v5.1 定稿）自动生成
# 生成命令：node tools/build-chapter.mjs
# 实现层补充：tools/ch5-timing.yaml（全局拍序 / 区间门 / 逐消息节拍 / 入场旗标 / 教学记忆收口 / 终局）
# 本文件是生成物，不要手改；剧本源与 script/feishu/*.mmd 是定稿，也不要改。
`;

function fail(message) {
  throw new Error(`[ch5 生成器] ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function readYaml(file, label) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    fail(`读不到 ${label}：${file}`);
  }
  const data = YAML.load(text);
  if (!data || typeof data !== "object" || Array.isArray(data)) fail(`${label} 不是 YAML 对象`);
  return data;
}

const source = readYaml(SCRIPT_PATH, "剧本源");
const overlay = readYaml(OVERLAY_PATH, "实现层 overlay");

// ---------- 剧本源结构校验（定稿里任何一个字段走样都直接停下） ----------
const axis = source.时间轴;
const turns = source.轮次;
assert(Array.isArray(axis) && axis.length > 0, "剧本源缺少顶层 时间轴");
assert(Array.isArray(turns) && turns.length > 0, "剧本源缺少顶层 轮次");
const axisRank = new Map(axis.map((label, index) => [String(label), index]));
assert(axisRank.size === axis.length, "顶层 时间轴 有重复档名");
assert(Number(source.章) === 5, `剧本源不是第五章（章=${String(source.章)}）`);

const 入场旗标 = overlay.入场旗标;
const 拍序 = overlay.拍序;
const 区间表 = overlay.区间 ?? [];
const 清空教学记忆 = new Set(overlay.清空教学记忆 ?? []);
const 节拍 = overlay.节拍 ?? {};
const 终局表 = overlay.终局 ?? {};
assert(拍序 && Array.isArray(拍序), "overlay 缺少 拍序");
assert(new Set(拍序).size === 拍序.length, "overlay 拍序 里有重复 id");
assert(入场旗标 && typeof 入场旗标 === "object", "overlay 缺少 入场旗标");

// ---------- 编号 ↔ 引擎 id ----------
function prefixOf(owner) {
  if (owner === "男生") return "5m.";
  if (owner === "女生") return "5f.";
  return fail(`未知 所属「${String(owner)}」`);
}

function engineId(number, owner) {
  const raw = String(number).trim();
  assert(/^5\./.test(raw), `编号「${raw}」不是 5.x 形式`);
  return prefixOf(owner) + raw.slice(2);
}

function waitId(value) {
  const raw = String(value).trim();
  const match = /^(男生|女生)(5\..+)$/.exec(raw);
  if (!match) fail(`等待「${raw}」无法解析（应形如 男生5.1.2）`);
  return engineId(match[2], match[1]);
}

function toArray(value) {
  return Array.isArray(value) ? value : [value];
}

// ---------- 逐拍编译 ----------
const order = new Map(拍序.map((id, index) => [String(id), index]));
const beats = [];
const seenIds = new Set();
const entryIds = [];
const endingBeats = [];

for (const [index, turn] of turns.entries()) {
  const where = `轮次第 ${index + 1} 拍（编号 ${String(turn.编号)}）`;
  const owner = turn.所属;
  const prefix = prefixOf(owner);
  const channel = owner === "男生" ? "left" : "right";
  const id = engineId(turn.编号, owner);
  assert(!seenIds.has(id), `引擎 id 重复：${id}`);
  seenIds.add(id);

  const time = String(turn.时间 ?? "").trim();
  assert(axisRank.has(time), `${where} 的 时间「${time}」不在顶层 时间轴 里`);
  assert(order.has(id), `${where} 生成的引擎 id「${id}」没有写进 overlay 拍序`);

  const options = toArray(turn.选项).map(String);
  const replies = toArray(turn.AI回复).map(String);
  assert(options.length > 0, `${where} 没有 选项`);
  assert(replies.length === options.length, `${where} 的 选项(${options.length}) 与 AI回复(${replies.length}) 数量对不上`);
  assert(typeof turn.用户消息 === "string" && turn.用户消息.length > 0, `${where} 缺少 用户消息`);
  assert(typeof turn.AI思考 === "string" && turn.AI思考.length > 0, `${where} 缺少 AI思考`);

  // 入场三变体 → when 旗标
  let when;
  if (turn.入场 !== undefined) {
    when = 入场旗标[String(turn.入场)];
    assert(when, `${where} 的 入场「${String(turn.入场)}」在 overlay 入场旗标 里没有映射`);
    entryIds.push(id);
  }

  // 等待门（严格先后）
  const requires = turn.等待 === undefined ? undefined : [waitId(turn.等待)];

  // 分叉 / 下一 / 终局 → choices[].next
  const terminal = String(turn.下一 ?? "") === "出口·在一起" || turn.终局 !== undefined;
  let fork = null;
  if (turn.分叉 !== undefined) {
    assert(turn.分叉 && typeof turn.分叉 === "object" && !Array.isArray(turn.分叉), `${where} 的 分叉 不是映射`);
    fork = turn.分叉;
    const keys = Object.keys(fork);
    assert(keys.length === options.length, `${where} 的 分叉(${keys.length}) 与 选项(${options.length}) 数量对不上`);
    for (const option of options) {
      assert(Object.prototype.hasOwnProperty.call(fork, option), `${where} 的 分叉 缺少选项「${option}」的键（键必须与选项文字一字不差）`);
    }
    for (const key of keys) {
      assert(options.includes(key), `${where} 的 分叉 多出键「${key}」`);
    }
  }
  assert(!(turn.下一 !== undefined && fork !== null), `${where} 同时写了 下一 与 分叉`);

  let ending;
  if (turn.终局 !== undefined) {
    const raw = String(turn.终局);
    const parts = raw.split("·");
    ending = parts.length > 1 ? parts[1] : raw;
    assert(Object.prototype.hasOwnProperty.call(终局表, ending), `${where} 的 终局「${raw}」没有在 overlay 终局 里声明`);
    endingBeats.push(id);
  }

  const singleNext = !terminal && fork === null && turn.下一 !== undefined
    ? engineId(turn.下一, owner)
    : undefined;
  if (singleNext) assert(options.length === 1, `${where} 有 ${options.length} 个选项却用了 下一（应写 分叉）`);

  // 逐句节拍覆盖
  const linePace = 节拍.句 ?? {};
  const choicePace = 节拍.选项 ?? {};
  const beatPace = 节拍.拍 ?? {};
  const lineOverride = (lineIndex) => {
    const value = linePace[`${id}:${lineIndex}`];
    return value === undefined ? {} : { 节拍: value };
  };

  const human = owner === "男生" ? "boy" : "girl";
  const lines = [
    { from: human, text: turn.用户消息, delivery: "pop", ...lineOverride(0) },
    { from: "ai", text: turn.AI思考, delivery: "thought", ...lineOverride(1) },
  ];

  const choices = options.map((thought, choiceIndex) => {
    const next = fork !== null
      ? engineId(fork[thought], owner)
      : terminal ? undefined : singleNext;
    const pace = choicePace[`${id}:${choiceIndex}`];
    const result = { thought, reply: replies[choiceIndex] };
    if (next !== undefined) result.next = next;
    if (pace !== undefined) result.节拍 = pace;
    return result;
  });

  // 记忆候选：原文照搬（短句要与①/④一字不差，validate 会再校验一次）
  const candidates = turn.记忆候选 === undefined
    ? undefined
    : toArray(turn.记忆候选).map((item) => ({
        缩略标签: String(item.缩略标签),
        短句: String(item.短句),
        类型: String(item.类型 ?? "干扰项"),
        线: String(item.线 ?? "无"),
      }));

  const beat = {
    id,
    channel,
    label: String(turn.标题 ?? ""),
    time,
    timeRank: axisRank.get(time),
    order: order.get(id),
  };
  if (when) beat.when = when;
  if (requires) beat.requires = requires;
  if (beatPace[id] !== undefined) beat.节拍 = beatPace[id];
  if (清空教学记忆.has(id)) beat.清空记忆 = channel;
  if (ending) beat.ending = ending;
  beat.lines = lines;
  beat.choices = choices;
  if (candidates) beat.记忆候选 = candidates;
  beats.push(beat);
}

// ---------- 区间门编译 ----------
const windows = new Map();
for (const rule of 区间表) {
  const targets = toArray(rule.拍).map(String);
  const lower = (rule.下界 ?? []).map(String);
  const upper = (rule.上界 ?? []).map(String);
  assert(upper.length > 0, `区间规则「${String(rule.说明 ?? "")}」缺少 上界`);
  for (const target of targets) {
    assert(seenIds.has(target), `区间规则指向不存在的拍「${target}」`);
    assert(!windows.has(target), `拍「${target}」被两条区间规则重复定义`);
  }
  for (const bound of [...lower, ...upper]) {
    assert(seenIds.has(bound), `区间规则「${String(rule.说明 ?? "")}」的边界「${bound}」不存在`);
  }
  // 边界必须与目标拍分属两窗，否则「对侧进度」无从谈起
  for (const target of targets) {
    const targetSide = target.startsWith("5m.") ? "5m." : "5f.";
    for (const bound of [...lower, ...upper]) {
      const boundSide = bound.startsWith("5m.") ? "5m." : "5f.";
      assert(targetSide !== boundSide, `区间规则「${String(rule.说明 ?? "")}」的边界「${bound}」与拍「${target}」在同一窗，无法表达跨窗区间`);
    }
  }
  for (const target of targets) {
    const rank = order.get(target);
    for (const bound of lower) {
      assert(order.get(bound) < rank, `区间下界「${bound}」排在拍「${target}」之后，区间永远无法成立`);
    }
    for (const bound of upper) {
      assert(order.get(bound) > rank, `区间上界「${bound}」排在拍「${target}」之前，区间会被提前关闭`);
    }
    windows.set(target, {
      channel: lower.concat(upper)[0].startsWith("5m.") ? "left" : "right",
      下界: lower,
      上界: upper,
      说明: String(rule.说明 ?? ""),
    });
  }
}
for (const beat of beats) {
  if (windows.has(beat.id)) beat.window = windows.get(beat.id);
}

// ---------- 图结构自检：根拍唯一、其余全可达、所有边只向前 ----------
const incoming = new Map(beats.map((beat) => [beat.id, 0]));
const roots = [];
for (const beat of beats) {
  const links = beat.choices.map((choice) => choice.next).filter(Boolean);
  for (const link of links) {
    assert(incoming.has(link), `拍 ${beat.id} 指向不存在的「${link}」`);
    assert(order.get(link) > beat.order, `拍 ${beat.id} 指向更靠前的「${link}」，会形成回环`);
    incoming.set(link, incoming.get(link) + 1);
  }
}
for (const beat of beats) {
  if (incoming.get(beat.id) === 0) roots.push(beat.id);
  assert(beat.when || incoming.get(beat.id) > 0, `拍 ${beat.id} 既不是入场变体、也没有任何拍指向它（会变成孤儿，播不到）`);
}
assert(roots.length === entryIds.length, `根拍数量 ${roots.length} 与入场变体数量 ${entryIds.length} 不一致`);
assert(new Set(roots).size === new Set(entryIds).size, "根拍集合与入场变体集合不一致");
for (const id of entryIds) assert(roots.includes(id), `入场变体「${id}」不是根拍`);

for (const beat of beats) {
  for (const required of beat.requires ?? []) {
    assert(seenIds.has(required), `拍 ${beat.id} 的等待门指向不存在的「${required}」`);
    assert(order.get(required) < beat.order, `拍 ${beat.id} 等的「${required}」排在它后面，会互相等死锁`);
  }
}

assert(beats.length === 拍序.length, `拍数 ${beats.length} 与 overlay 拍序 ${拍序.length} 不一致`);
assert(endingBeats.length > 0, "没有任何终局拍");

// ---------- 终局声明 ----------
const endings = Object.entries(终局表).map(([id, config]) => ({
  id,
  title: String(config.标题 ?? id),
  requires: toArray(config.需要 ?? []).map(String),
  set: config.旗标 ?? {},
}));
for (const ending of endings) {
  for (const need of ending.requires) assert(seenIds.has(need), `终局「${ending.id}」要求的拍「${need}」不存在`);
}

// ---------- 输出 ----------
const output = {
  title: String(overlay.标题 ?? source.标题),
  chapter: 5,
  时间轴: axis.map(String),
  默认节拍: String(overlay.默认节拍 ?? "正常"),
  speakers: [
    { id: "boy", name: "男生", channel: "left" },
    { id: "girl", name: "女生", channel: "right" },
    { id: "ai", name: "AI" },
  ],
  endings,
  beats,
};

const dumpOptions = { lineWidth: -1, noRefs: true, sortKeys: false, quotingType: '"', forceQuotes: false };
const generated = HEADER + YAML.dump(output, dumpOptions);

if (CHECK) {
  let current = null;
  try {
    current = fs.readFileSync(OUTPUT_PATH, "utf8");
  } catch {
    current = null;
  }
  if (current === null) {
    console.error("content/chapter-05.yaml 不存在，请跑 node tools/build-chapter.mjs");
    process.exit(1);
  }
  if (current.trimEnd() !== generated.trimEnd()) {
    console.error("content/chapter-05.yaml 已漂移，与 script/ch5.yaml v5.1 + overlay 不同步。");
    console.error("修复：node tools/build-chapter.mjs");
    process.exit(1);
  }
  console.log(`同步校验通过：${beats.length} 拍、${axis.length} 档时间轴、${windows.size} 个区间拍、${endings.length} 个终局。`);
  process.exit(0);
}

fs.writeFileSync(OUTPUT_PATH, generated, "utf8");
console.log(
  `已生成 content/chapter-05.yaml：${beats.length} 拍、${axis.length} 档时间轴、` +
  `${beats.filter((b) => b.requires).length} 个等待门、${windows.size} 个区间拍、` +
  `${Object.keys(节拍.拍 ?? {}).length} 处拍级节拍、${endingBeats.length} 个终局拍。`,
);
