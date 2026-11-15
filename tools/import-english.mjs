import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";

const source = readFileSync(process.argv[2], "utf8").replace(/\r\n/g, "\n");
const beats = {}, summaries = {}, titles = [], endings = {};
let beat, choice, section = "";
const blocks = text => [...text.matchAll(/^(?:>[^\n]*\n?)+/gm)].map(([block]) =>
  block.trimEnd().split("\n").map(line => line.replace(/^> ?/, "")).join("\n"));
const split = source.split(/^(?=## |### |\*\*[^\n]+\*\*[^\n]*$)/m);
for (const chunk of split) {
  const head = chunk.split("\n")[0];
  const quotes = blocks(chunk);
  const heading = head.match(/^### `([^`]+)` · [^·]+ · (.+)$/);
  if (heading) {
    assert(!beats[heading[1]], heading[1]);
    const time = heading[2].split(" / ").at(-1);
    beat = beats[heading[1]] = { time, lines: [], choices: [], memories: [] };
    choice = undefined;
    section = "beat";
    continue;
  }
  const title = head.match(/^## .+ \/ (.+)$/);
  if (title) titles.push(title[1]);
  if (head.startsWith("### 右栏摘要")) section = "summary";
  if (head === "## 右栏默认摘要") {
    assert.equal(quotes.length, 2);
    summaries[quotes[0]] = quotes[1];
  }
  if (head.startsWith("**终局**")) {
    const zh = head.split(" · ").at(-1);
    endings[zh] = split[split.indexOf(chunk) + 1].split("\n")[0].slice(2,-2);
  }
  if (section === "summary" && head.startsWith("**[")) {
    assert.equal(quotes.length, 2, head);
    summaries[quotes[0]] = quotes[1];
  }
  if (section !== "beat") continue;
  const option = head.match(/^\*\*选项 \/ Choice (\d+) · (.*?)\*\*(?: _.*_)?$/);
  const memory = head.match(/^\*\*可存记忆 \/ Memory · (.+)\*\*$/);
  if (option) {
    assert.equal(quotes.length, 1, head + JSON.stringify(quotes));
    assert.equal(Number(option[1]), beat.choices.length + 1);
    choice = { thought: [quotes[0], option[2]] };
    beat.choices.push(choice);
  } else if (memory) {
    assert.equal(quotes.length, 2, head);
    const [label, ...parts] = quotes[0].split(" · ");
    beat.memories.push({ label, name: memory[1], quote: [parts.join(" · "), quotes[1]] });
  } else if (["**Him**", "**Her**", "**AI thinking**", "**AI**"].includes(head)) {
    assert.equal(quotes.length, 2, head);
    if (head === "**AI**" && choice && !choice.reply) choice.reply = quotes;
    else beat.lines.push(quotes);
  }
}
assert.equal(titles.length, 9);
assert.equal(Object.keys(beats).length, 228);
assert.equal(Object.keys(summaries).length, 103);
writeFileSync(new URL("../src/englishScript.json", import.meta.url), JSON.stringify({ beats, summaries, titles, endings }, null, 2) + "\n");
