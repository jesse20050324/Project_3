// 从 script/ch5.yaml 直接生成飞书适配版 script/feishu/ch5.mmd
// 用法：node script/feishu/build.mjs
// 飞书适配规则：graph 关键字 / subgraph 分线 / br 换行 / 无花形节点 /
//   边标签纯文本 / 无 & 语法 / 无 emoji / 无任何引号字符（定界符除外）
// ◆…◆ = 记忆候选（含正牌与干扰项，视觉等同不剧透）；节点尾行给开发侧类型信息。

import fs from "node:fs";
import path from "node:path";
import YAML from "js-yaml";

const root = path.resolve(import.meta.dirname, "..", "..");
const src = path.join(root, "script", "ch5.yaml");
const out = path.join(root, "script", "feishu", "ch5.mmd");

const script = YAML.load(fs.readFileSync(src, "utf8"));

// ---------- 飞书适配清洗 ----------
const sanitize = (s) =>
  String(s ?? "")
    .replace(/ · /g, " ")
    .replace(/·/g, "")
    .replace(/[【】「」“”‘’"'']/g, "")
    .replace(/⏳等男生/g, " 需等男生")
    .replace(/⏳/g, "")
    .replace(/→/g, "出口：");

// 标点不敏感地找 短句 在原文中的精确跨度，返回原文中的原样片段
function findSpan(msg, phrase) {
  if (!msg || !phrase) return null;
  if (msg.includes(phrase)) return phrase;
  const isPunct = (ch) => "，。、；：？！…—“”‘’「」【】".includes(ch);
  const strip = (s) => Array.from(s).filter((c) => !isPunct(c) && c !== " ");
  const mArr = Array.from(msg);
  const norm = strip(msg).join("");
  const pNorm = strip(phrase).join("");
  const idx = norm.indexOf(pNorm);
  if (idx < 0) return null;
  // 从归一化位置映射回原文下标
  let normPos = -1;
  for (let i = 0; i < mArr.length; i++) {
    if (!isPunct(mArr[i]) && mArr[i] !== " ") normPos++;
    if (normPos === idx) {
      // 找归一化长度对应的原文结尾
      let count = 0;
      for (let j = i; j < mArr.length; j++) {
        if (!isPunct(mArr[j]) && mArr[j] !== " ") count++;
        if (count === pNorm.length) return mArr.slice(i, j + 1).join("");
      }
    }
  }
  return null;
}

// 自动换行：每 42 字符插一个 <br/>（不断开◆对）
function wrap(text, width = 42) {
  const chars = Array.from(text);
  const lines = [];
  let line = "";
  for (const ch of chars) {
    line += ch;
    if (line.length >= width && /[，。、；！？…]/.test(ch)) {
      lines.push(line);
      line = "";
    }
  }
  if (line) lines.push(line);
  return lines.join("<br/>");
}

// ---------- 节点渲染 ----------
const nodeId = (turn) => (turn.所属 === "男生" ? "M" : "F") + turn.编号.replace(/\./g, "");

function renderTurn(turn) {
  let user = sanitize(turn.用户消息 || "");
  const marks = [];
  for (const cand of turn.记忆候选 || []) {
    const span = findSpan(turn.用户消息 || "", cand.短句);
    if (span) {
      const safe = sanitize(span);
      if (user.includes(safe)) {
        user = user.replace(safe, "◆" + safe + "◆");
        marks.push(`◆记忆：${sanitize(cand.缩略标签)}｜${sanitize(cand.类型)}·${sanitize(cand.线)}`);
      } else {
        marks.push(`◆记忆（未定位）：${sanitize(cand.缩略标签)}｜${sanitize(cand.类型)}·${sanitize(cand.线)}`);
      }
    } else {
      marks.push(`◆记忆（未定位）：${sanitize(cand.缩略标签)}｜${sanitize(cand.类型)}·${sanitize(cand.线)}`);
    }
  }
  const thought = sanitize(turn.AI思考 || "");
  const choices = Array.isArray(turn.选项) ? turn.选项.map(sanitize).join(" / ") : sanitize(turn.选项 || "");
  const reply = sanitize(turn.AI回复 || "");
  const parts = [];
  const title = sanitize(turn.编号 + " " + (turn.标题 || "") + (turn.等待 ? " 需等" + sanitize(turn.等待) : ""));
  parts.push(title);
  parts.push("①" + user);
  if (thought) parts.push("②思考：" + thought);
  if (choices) parts.push("③选项：" + choices);
  if (reply) parts.push("④回复：" + reply);
  for (const m of marks) parts.push(m);
  if (turn.终局) parts.push("终局：" + sanitize(turn.终局));
  return wrap(parts.join("<br/>"));
}

// ---------- 边渲染 ----------
const turns = script.轮次;
const byLane = { 男生: [], 女生: [] };
for (const t of turns) byLane[t.所属].push(t);

const lines = [];
lines.push("%% 幕5 全文轮次图 飞书画板适配版");
lines.push("%% 提取自 script/ch5.yaml（直接生成，无中间版本）");
lines.push("%% 图例：◆…◆＝记忆候选（正牌与干扰项视觉等同）；尾行＝开发侧类型信息");
lines.push("");
lines.push("graph TD");
lines.push("LEG[" + '"图例：◆…◆＝记忆候选；尾行记忆：缩略标签｜类型·线；类型为开发信息，玩家UI不显示"' + "]");

for (const [lane, list] of Object.entries(byLane)) {
  lines.push(`subgraph L${lane === "男生" ? 1 : 2} ["${sanitize(lane)}线"]`);
  // 入场变体
  const variants = list.filter((t) => t.入场);
  if (variants.length) {
    lines.push("IN" + (lane === "男生" ? "M" : "F") + '["幕4旗标"]');
    for (const v of variants) {
      const label = String(v.入场).includes("双问") ? "双问" : String(v.入场).includes("仅男问") ? "仅男问" : "仅女问";
      lines.push(`IN${lane === "男生" ? "M" : "F"} -->|${label}| ${nodeId(v)}`);
    }
  }
  for (const t of list) {
    lines.push(`${nodeId(t)}["${renderTurn(t)}"]`);
  }
  // 下一 与 终局
  for (const t of list) {
    const nid = nodeId(t);
    if (t.下一 && String(t.下一).startsWith("出口")) {
      if (t.终局) lines.push(`${nid} -->|${sanitize(t.终局)}| EXIT`);
    } else if (t.下一) {
      const target = list.find((x) => x.编号 === t.下一);
      if (target) lines.push(`${nid} --> ${nodeId(target)}`);
    }
  }
  // 入场变体汇合到首个非变体拍
  if (variants.length) {
    const firstMain = list.find((t) => !t.入场);
    for (const v of variants) lines.push(`${nodeId(v)} --> ${nodeId(firstMain)}`);
  }
  lines.push("end");
}

// 跨线时序（等待）
for (const t of turns) {
  if (!t.等待) continue;
  const ref = String(t.等待); // 如 男生5.2.1
  const lane = ref.startsWith("男生") ? "男生" : "女生";
  const num = ref.replace(/^.*?生/, "");
  const srcTurn = byLane[lane].find((x) => x.编号 === num);
  if (srcTurn) lines.push(`${nodeId(srcTurn)} -.->|时序| ${nodeId(t)}`);
}
lines.push('EXIT["出口 在一起 进块6+7"]');

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, lines.join("\n") + "\n", "utf8");
console.log("written:", out, lines.length, "lines");
