// 飞书适配版 .mmd 构建器（唯一可视化输出，直接从 yaml 生成，无中间层）
// 用法：node script/feishu/build.mjs
// 支持：script/ch3.yaml、ch4.yaml、ch5.yaml（统一轮次格式）→ ch3/4/5.mmd
//       content/chapter-01.yaml（引擎 Beat/Choice 格式，含记忆候选）→ ch1.mmd
// 旧 chapter-02（引擎格式）已并入第三幕剧本，不再单独出图。
// 飞书适配：graph 关键字 / subgraph 分线（SGM/SGF，防撞名）/ br 换行 /
//   无花形节点 / 边标签纯文本 / 无 & 语法 / 无 emoji / 无任何引号字符（定界符除外）。
// ◆…◆ = 记忆候选；选项置灰门渲染为"选项文字（需记忆：标签）"。
// 手写 .mmd（如 script/act5-8-structure.mmd）用户是整文件粘贴进飞书，文件必须是纯 mermaid：
//   以 graph TD 开头，禁止 # 注释、``` 围栏、flowchart、菱形 {}；节点与边分行写；
//   分叉要汇回主线（真结局除外）。踩坑记录见 .learnings/LEARNINGS.md LRN-20261107-005。

import fs from "node:fs";
import path from "node:path";
import YAML from "js-yaml";

const feishuDir = import.meta.dirname;
const scriptDir = path.resolve(feishuDir, "..");
const repoRoot = path.resolve(scriptDir, "..");

// ---------- 飞书适配清洗 ----------
const sanitize = (s) =>
  String(s ?? "")
    .replace(/\r?\n+/g, "<br/>")
    .replace(/ · /g, " ")
    .replace(/·/g, "")
    .replace(/[【】「」“”‘’"'']/g, "")
    .replace(/⏳等男生/g, " 需等男生")
    .replace(/⏳/g, "")
    .replace(/→/g, "出口：")
    .trim();

// 标点不敏感地在原文中定位短句，返回原文原样片段
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
  let normPos = -1;
  for (let i = 0; i < mArr.length; i++) {
    if (!isPunct(mArr[i]) && mArr[i] !== " ") normPos++;
    if (normPos === idx) {
      let count = 0;
      for (let j = i; j < mArr.length; j++) {
        if (!isPunct(mArr[j]) && mArr[j] !== " ") count++;
        if (count === pNorm.length) return mArr.slice(i, j + 1).join("");
      }
    }
  }
  return null;
}

// 在一段文本里给短句加 ◆ 标记（先原文定位，再整体清洗）
function markSpan(text, phrase) {
  const span = findSpan(text, phrase);
  if (!span) return { text, hit: false };
  const safe = sanitize(span);
  const out = sanitize(text);
  if (out.includes(safe)) return { text: out.replace(safe, "◆" + safe + "◆"), hit: true };
  return { text: out, hit: false };
}

// 自动换行：到宽度后遇标点断行
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

const node = (id, text) => `${id}["${text}"]`;

const optText = (o) => (typeof o === "string" ? o : o.文字);
const optGate = (o) => (typeof o === "string" ? null : o.需记忆 ?? null);
const optLabel = (o) => optText(o) + (optGate(o) ? "（需记忆：" + optGate(o) + "）" : "");

// ---------- 一、script 轮次格式（ch3/ch4/ch5） ----------
function buildScriptFormat(srcFile, outName, header, exitLabel) {
  const y = YAML.load(fs.readFileSync(path.join(scriptDir, srcFile), "utf8"));
  const turns = y.轮次;
  const byLane = { 男生: [], 女生: [] };
  for (const t of turns) byLane[t.所属].push(t);
  const nid = (lane, num) => (lane === "男生" ? "M" : "F") + String(num).replace(/[.\-]/g, "");
  // 变体组：分叉/下一指向的基编号（如 3.4.3）会展开为 3.4.3-A/B，各带当条件标签
  const baseOf = (num) => String(num).replace(/-[A-C]$/, "");
  const referenced = new Set();
  for (const t of turns) {
    if (t.下一) referenced.add(baseOf(t.下一));
    for (const child of t.分叉 ? Object.values(t.分叉) : []) referenced.add(baseOf(child));
  }
  const targetsOf = (lane, num) => {
    const exact = byLane[lane].find((x) => x.编号 === num);
    if (exact) return [exact];
    return byLane[lane].filter((x) => x.编号.startsWith(String(num) + "-"));
  };
  const isEntryVariant = (t) => t.入场 && !referenced.has(baseOf(t.编号));

  const renderTurn = (t) => {
    const parts = [sanitize(t.编号 + " " + (t.标题 || "") + (t.等待 ? " 需等" + sanitize(t.等待) : ""))];
    parts.push("①" + sanitize(t.用户消息 || ""));
    if (t.AI思考) parts.push("②思考：" + sanitize(t.AI思考));
    const opts = t.选项 ?? [];
    if (opts.length) parts.push("③选项：" + opts.map(optLabel).map(sanitize).join(" / "));
    const replies = Array.isArray(t.AI回复) ? t.AI回复 : t.AI回复 ? [t.AI回复] : [];
    if (replies.length === 1) parts.push("④回复：" + sanitize(replies[0]));
    else replies.forEach((r, i) => parts.push("④" + "ABC"[i] + "：" + sanitize(r)));
    let userText = parts[1]; // ①先暂存，候选标记累积后再写回
    for (const c of t.记忆候选 || []) {
      const span = findSpan(t.用户消息 || "", c.短句);
      let hit = false;
      if (span) {
        const safe = sanitize(span);
        if (userText.includes(safe)) {
          userText = userText.replace(safe, "◆" + safe + "◆");
          hit = true;
        }
      }
      parts.push(`◆记忆：${sanitize(c.缩略标签)}｜${sanitize(c.类型)}·${sanitize(c.线)}${hit ? "" : "（未定位）"}`);
    }
    if (userText !== parts[1]) parts[1] = userText;
    if (t.备注) parts.push("备注：" + sanitize(t.备注));
    if (t.终局) parts.push("终局：" + sanitize(t.终局));
    return wrap(parts.join("<br/>"));
  };

  const lines = [];
  lines.push("%% " + header);
  lines.push("%% 提取自 script/" + srcFile + "（直接生成，无中间版本）");
  lines.push("");
  lines.push("graph TD");

  for (const [lane, list] of Object.entries(byLane)) {
    if (!list.length) continue;
    lines.push(`subgraph SG${lane === "男生" ? "M" : "F"} ["${lane}线"]`);
    const entryVariants = list.filter((t) => isEntryVariant(t));
    if (entryVariants.length) {
      const inId = "IN" + (lane === "男生" ? "M" : "F");
      lines.push(`${inId}["入场旗标"]`);
      for (const v of entryVariants) lines.push(`${inId} -->|${sanitize(v.入场)}| ${nid(lane, v.编号)}`);
    }
    for (const t of list) lines.push(node(nid(lane, t.编号), renderTurn(t)));
    for (const t of list) {
      const id = nid(lane, t.编号);
      const draw = (label, num) => {
        for (const target of targetsOf(lane, num)) {
          if (!target) continue;
          const gate = target.入场 ? `（当${sanitize(target.入场)}）` : "";
          const edgeLabel = label ? `|${label}${gate}|` : gate ? `|当${sanitize(target.入场)}|` : "";
          lines.push(`${id} -->${edgeLabel} ${nid(lane, target.编号)}`);
        }
      };
      if (t.下一) draw(null, t.下一);
      else if (t.分叉) for (const [opt, child] of Object.entries(t.分叉)) draw(sanitize(optLabel(opt)), child);
      if (t.终局) lines.push(`${id} -->|${sanitize(t.终局)}| EXIT`);
    }
    if (entryVariants.length) {
      const firstMain = list.find((t) => !t.入场);
      for (const v of entryVariants) {
        // 变体已有出边（下一/分叉）时不再补汇合边，否则同一对节点会出现重复线
        if (!v.下一 && !v.分叉) lines.push(`${nid(lane, v.编号)} --> ${nid(lane, firstMain.编号)}`);
      }
    }
    lines.push("end");
  }
  for (const t of turns) {
    if (!t.等待) continue;
    const ref = String(t.等待);
    const lane = ref.startsWith("男生") ? "男生" : "女生";
    const num = ref.replace(/^.*?生/, "");
    for (const src of targetsOf(lane, num)) {
      lines.push(`${nid(lane, src.编号)} -.->|时序| ${nid(t.所属, t.编号)}`);
    }
  }
  lines.push(`EXIT["${sanitize(exitLabel)}"]`);
  return { file: path.join(feishuDir, outName), lines };
}

// ---------- 二、引擎 Beat/Choice 格式（ch1） ----------
function buildEngineFormat(chapterFile, outName) {
  const y = YAML.load(fs.readFileSync(path.join(repoRoot, "content", chapterFile), "utf8"));
  const beats = y.beats;
  const byLane = { 男生: [], 女生: [] };
  for (const b of beats) byLane[b.channel === "left" ? "男生" : "女生"].push(b);
  const byId = Object.fromEntries(beats.map((b) => [b.id, b]));

  const renderBeat = (b) => {
    const parts = [sanitize(b.id)];
    for (const ln of b.lines || []) {
      const who = ln.from === "boy" ? "男" : ln.from === "girl" ? "女" : "AI";
      const kind = ln.from === "ai" && ln.delivery === "thought" ? "AI思考" : who;
      parts.push(kind + "：" + ln.text);
    }
    for (const ch of b.choices || []) {
      parts.push("③选项：" + ch.thought);
      parts.push("④回复：" + ch.reply);
      if (ch.set) parts.push("立旗标：" + Object.entries(ch.set).map(([k, v]) => `${k}=${v}`).join("，"));
    }
    if (b.requires) parts.push("等：" + b.requires.join("，"));
    if (b.when) parts.push("当：" + Object.entries(b.when).map(([k, v]) => `${k}=${v}`).join("，"));
    if (b.aside) parts.push("注：" + b.aside);
    const notes = [];
    for (const c of b.记忆候选 || []) {
      let hit = false;
      for (let i = 1; i < parts.length; i++) {
        if (parts[i].includes("：") && !hit) {
          const { text, hit: ok } = markSpan(parts[i], c.短句);
          if (ok) {
            parts[i] = text;
            hit = true;
          }
        }
      }
      notes.push(`◆记忆：${sanitize(c.缩略标签)}｜${sanitize(c.类型)}·${sanitize(c.线)}${hit ? "" : "（未定位）"}`);
    }
    for (const n of notes) parts.push(n);
    return wrap(parts.map(sanitize).join("<br/>"));
  };

  const lines = [];
  lines.push(`%% ${sanitize(y.title)} 飞书画板适配版（直接生成自 content/${chapterFile}）`);
  lines.push("");
  lines.push("graph TD");

  for (const [lane, list] of Object.entries(byLane)) {
    if (!list.length) continue;
    lines.push(`subgraph SG${lane === "男生" ? "M" : "F"} ["${lane}线"]`);
    for (const b of list) lines.push(node(b.id, renderBeat(b)));
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.next) {
        if (byId[b.next]) lines.push(`${b.id} --> ${b.next}`);
      } else if (b.choices) {
        for (const ch of b.choices) if (ch.next && byId[ch.next]) lines.push(`${b.id} -->|${sanitize(ch.thought)}| ${ch.next}`);
      } else if (i < list.length - 1 && !b.when) {
        lines.push(`${b.id} --> ${list[i + 1].id}`);
      }
      if (b.requires) {
        for (const r of b.requires) {
          if (byId[r]) lines.push(`${r} -.->|${b.when ? "当：" + Object.entries(b.when).map(([k, v]) => `${k}=${v}`).join("，") : "时序"}| ${b.id}`);
        }
      }
    }
    const needPrev = list.some((b) => b.when && !(b.requires || []).some((r) => byId[r]));
    if (needPrev) {
      lines.push(`PREV["上一章汇合"]`);
      for (const b of list) if (b.when && !(b.requires || []).some((r) => byId[r]))
        lines.push(`PREV -->|当：${Object.entries(b.when).map(([k, v]) => `${k}=${v}`).join("，")}| ${b.id}`);
    }
    lines.push("end");
  }
  return { file: path.join(feishuDir, outName), lines };
}

// ---------- 主流程 ----------
const outputs = [
  buildEngineFormat("chapter-01.yaml", "ch1.mmd"),
  buildScriptFormat("ch3.yaml", "ch3.mmd", "第三幕 桌游店 全文轮次图", "第三幕收线 出口 进第四幕"),
  buildScriptFormat("ch4.yaml", "ch4.mmd", "第四幕 结缘 全文轮次图", "终局 问或不问 出口 双问单问进幕5 双不问over"),
  buildScriptFormat("ch5.yaml", "ch5.mmd", "幕5 全文轮次图", "出口 在一起 进块6+7"),
];
for (const o of outputs) {
  fs.writeFileSync(o.file, o.lines.join("\n") + "\n", "utf8");
  console.log("written:", path.relative(repoRoot, o.file), o.lines.length, "lines");
}
try {
  fs.rmSync(path.join(feishuDir, "ch2.mmd"));
  console.log("removed: script/feishu/ch2.mmd (旧幕2已并入第三幕)");
} catch {}
