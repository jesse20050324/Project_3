// 飞书适配版 .mmd 构建器（唯一可视化输出，直接从 yaml 生成，无中间层）
// 用法：node script/feishu/build.mjs
// 支持：script/ch5.yaml（轮次四条格式）→ ch5.mmd
//       content/chapter-01.yaml、chapter-02.yaml（引擎 Beat/Choice 格式）→ ch1.mmd、ch2.mmd
// ch3/ch4（原文/定稿双层格式）暂用早期生成的 mmd，待定稿时再接入本构建器。
// 飞书适配规则：graph 关键字 / subgraph 分线 / br 换行 / 无花形节点 /
//   边标签纯文本 / 无 & 语法 / 无 emoji / 无任何引号字符（定界符除外）。
// ◆…◆ = 记忆候选（正牌与干扰项视觉等同）。

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

// ---------- 一、script 轮次格式（ch5） ----------
function buildScriptFormat() {
  const y = YAML.load(fs.readFileSync(path.join(scriptDir, "ch5.yaml"), "utf8"));
  const turns = y.轮次;
  const byLane = { 男生: [], 女生: [] };
  for (const t of turns) byLane[t.所属].push(t);
  const nid = (t) => (t.所属 === "男生" ? "M" : "F") + t.编号.replace(/\./g, "");

  const renderTurn = (t) => {
    let user = sanitize(t.用户消息 || "");
    const marks = [];
    for (const c of t.记忆候选 || []) {
      const span = findSpan(t.用户消息 || "", c.短句);
      const safe = span ? sanitize(span) : null;
      if (safe && user.includes(safe)) user = user.replace(safe, "◆" + safe + "◆");
      marks.push(`◆记忆：${sanitize(c.缩略标签)}｜${sanitize(c.类型)}·${sanitize(c.线)}${safe && user.includes("◆" + safe) ? "" : "（未定位）"}`);
    }
    const parts = [sanitize(t.编号 + " " + (t.标题 || "") + (t.等待 ? " 需等" + sanitize(t.等待) : ""))];
    parts.push("①" + user);
    if (t.AI思考) parts.push("②思考：" + sanitize(t.AI思考));
    if (t.选项) parts.push("③选项：" + (Array.isArray(t.选项) ? t.选项.map(sanitize).join(" / ") : sanitize(t.选项)));
    if (t.AI回复) parts.push("④回复：" + sanitize(t.AI回复));
    marks.forEach((m) => parts.push(m));
    if (t.终局) parts.push("终局：" + sanitize(t.终局));
    return wrap(parts.join("<br/>"));
  };

  const lines = [];
  lines.push("%% 幕5 全文轮次图 飞书画板适配版（直接生成自 script/ch5.yaml）");
  lines.push("%% 图例：◆…◆＝记忆候选（正牌与干扰项视觉等同）；尾行记忆：缩略标签｜类型·线（开发信息，玩家UI不显示）");
  lines.push("");
  lines.push("graph TD");
  lines.push('LEG["图例：◆…◆＝记忆候选"]');

  for (const [lane, list] of Object.entries(byLane)) {
    lines.push(`subgraph SG${lane === "男生" ? "M" : "F"} ["${lane}线"]`);
    const variants = list.filter((t) => t.入场);
    if (variants.length) {
      const inId = "IN" + (lane === "男生" ? "M" : "F");
      lines.push(`${inId}["幕4旗标"]`);
      for (const v of variants) {
        const label = String(v.入场).includes("双问") ? "双问" : String(v.入场).includes("仅男问") ? "仅男问" : "仅女问";
        lines.push(`${inId} -->|${label}| ${nid(v)}`);
      }
    }
    for (const t of list) lines.push(node(nid(t), renderTurn(t)));
    for (const t of list) {
      if (t.下一 && String(t.下一).startsWith("出口")) {
        if (t.终局) lines.push(`${nid(t)} -->|${sanitize(t.终局)}| EXIT`);
      } else if (t.下一) {
        const target = list.find((x) => x.编号 === t.下一);
        if (target) lines.push(`${nid(t)} --> ${nid(target)}`);
      }
    }
    if (variants.length) {
      const firstMain = list.find((t) => !t.入场);
      for (const v of variants) lines.push(`${nid(v)} --> ${nid(firstMain)}`);
    }
    lines.push("end");
  }
  for (const t of turns) {
    if (!t.等待) continue;
    const lane = String(t.等待).startsWith("男生") ? "男生" : "女生";
    const src = byLane[lane].find((x) => x.编号 === String(t.等待).replace(/^.*?生/, ""));
    if (src) lines.push(`${nid(src)} -.->|时序| ${nid(t)}`);
  }
  lines.push('EXIT["出口 在一起 进块6+7"]');
  return { file: path.join(feishuDir, "ch5.mmd"), lines };
}

// ---------- 二、引擎 Beat/Choice 格式（ch1、ch2） ----------
function buildEngineFormat(chapterFile, outName, prevChapterLabel) {
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
      parts.push(kind + "：" + sanitize(ln.text));
    }
    for (const ch of b.choices || []) {
      parts.push("③选项：" + sanitize(ch.thought));
      parts.push("④回复：" + sanitize(ch.reply));
      if (ch.set) parts.push("立旗标：" + Object.entries(ch.set).map(([k, v]) => `${k}=${v}`).join("，"));
    }
    if (b.requires) parts.push("等：" + b.requires.join("，"));
    if (b.when) parts.push("当：" + Object.entries(b.when).map(([k, v]) => `${k}=${v}`).join("，"));
    if (b.aside) parts.push("注：" + sanitize(b.aside));
    return wrap(parts.join("<br/>"));
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
    // 变体拍无同章依赖来源时，用上一章汇合节点引入
    const needPrev = list.some((b) => b.when && !(b.requires || []).some((r) => byId[r]));
    if (needPrev && prevChapterLabel) {
      lines.push(`PREV["${prevChapterLabel}"]`);
      for (const b of list) if (b.when && !(b.requires || []).some((r) => byId[r]))
        lines.push(`PREV -->|当：${Object.entries(b.when).map(([k, v]) => `${k}=${v}`).join("，")}| ${b.id}`);
    }
    lines.push("end");
  }
  return { file: path.join(feishuDir, outName), lines };
}

// ---------- 主流程 ----------
const outputs = [
  buildEngineFormat("chapter-01.yaml", "ch1.mmd", null),
  buildEngineFormat("chapter-02.yaml", "ch2.mmd", "CH1 结束"),
  buildScriptFormat(),
];
for (const o of outputs) {
  fs.writeFileSync(o.file, o.lines.join("\n") + "\n", "utf8");
  console.log("written:", path.relative(repoRoot, o.file), o.lines.length, "lines");
}
