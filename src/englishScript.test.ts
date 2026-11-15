import { expect, test } from "vitest";
import { loadBundledScript } from "./engine/loadScript";
import { summariesFor } from "./contextSummaries";
import { englishBeats, englishSummaries, messageText } from "./language";

test("the English script matches every live beat, choice, memory and archive rule", () => {
  const { script, error } = loadBundledScript();
  expect(error).toBeNull();
  const defects: string[] = [];
  function check(ok: unknown, label: string) { if (!ok) defects.push(label); }
  expect(Object.keys(englishBeats).length).toBe(script!.beats.length);
  const clean = (s?: string) => s?.trim();
  for (const beat of script!.beats) {
    const en = englishBeats[beat.id]!;
    expect(en, beat.id).toBeDefined();
    check(en.lines.length === beat.lines.length, beat.id + " line count");
    check(en.choices.length === (beat.choices?.length ?? 0), beat.id + " choice count");
    beat.lines.forEach((line, index) => {
      check(clean(en.lines[index]?.[0]) === clean(line.text), beat.id + " line " + index);
    });
    beat.choices?.forEach((choice, index) => {
      check(clean(en.choices[index]?.thought[0]) === clean(choice.thought), beat.id + " thought " + index);
      check(clean(en.choices[index]?.reply?.[0]) === clean(choice.reply), beat.id + " reply " + index);
    });
    check(en.memories.length === (beat.记忆候选?.length ?? 0), beat.id + " memory count");
    for (const memory of beat.记忆候选 ?? []) {
      const localized = en.memories.find(item => item.label === memory.缩略标签 && item.quote[0] === memory.短句);
      check(localized && [...en.lines, ...en.choices.map(c => c.reply)].some(pair => pair?.[1].includes(localized.quote[1])),
        beat.id + " memory " + memory.缩略标签);
    }
    for (const summary of summariesFor({ chapter: beat.chapter!, beatIds: [beat.id] })) {
      check(englishSummaries[summary.text], beat.id + " summary " + summary.text);
    }
  }
  expect(defects).toEqual([]);
  expect(messageText({ id: "L1:0", beatId: "L1", text: script!.beatById!.get("L1")!.lines[0].text })).toMatch(/^My friend/);
});
