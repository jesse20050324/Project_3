import { expect, it } from "vitest";
import { loadBundledScript } from "./loadScript";
import { choiceMemoryGate, choose, commitLine, commitReply, createInitial, openChannel, playbackStep, ritualTick } from "./scheduler";
import { loadProgress, saveProgress } from "./storage";
import type { Channel, MemoryEntry } from "./types";

const cases = [
  { route: "E", evidence: [] },
  { route: "S", evidence: [0] },
  { route: "O5", evidence: [1, 2] },
  { route: "O7", evidence: [1, 2, 3] },
  { route: "B5", evidence: [0, 1, 2] },
  { route: "B7", evidence: [0, 1, 2, 3] },
];
const labels = {
  left: ["要求看私聊", "都会回", "不会谈恋爱", "一天没回", "青杏"],
  right: ["故意不回", "家里有爱", "半夜刷朋友圈", "查看私聊", "想吃青提蛋糕"],
};

it("第七幕旧存档继续进入第八幕，验证144种准备与矩阵组合、两窗先后及终局", () => {
  const { script, error } = loadBundledScript();
  if (!script) throw new Error(error ?? "剧本加载失败");
  const { beats, beatById } = script;
  const completed = beats.filter(beat => (beat.chapter ?? 0) < 8 && beat.ending !== "未交换微信").map(beat => beat.id);
  const memoryFor = (channel: Channel, index: number): MemoryEntry => {
    const label = labels[channel][index];
    const beat = beats.find(beat => beat.channel === channel && beat.记忆候选?.some(candidate => candidate.缩略标签 === label))!;
    return { label, beatId: beat.id, text: beat.记忆候选!.find(candidate => candidate.缩略标签 === label)!.短句 };
  };
  const configs = cases.flatMap(config => [false, true].map(useDaily => ({ ...config, useDaily })));
  for (const left of configs) {
    for (const right of configs) {
      const route = { left, right };
      const memories = {
        left: [...left.evidence, 4].map(index => memoryFor("left", index)),
        right: [...right.evidence, 4].map(index => memoryFor("right", index)),
      };
      saveProgress({ ...createInitial(beats), activated: [], chapter: { left: 7, right: 7 }, completed, memories });
      let state = loadProgress(beats)!;
      expect(state.memories).toEqual(memories);
      const played: string[] = [];
      for (let step = 0; step < 500; step++) {
        const resetting = (["left", "right"] as const).find(channel => state.ritual[channel]);
        if (resetting) {
          state = ritualTick(state, resetting, state.ritual[resetting]!.until);
          continue;
        }
        const channel = (["left", "right"] as const).find(channel => state.pending[channel]);
        if (channel) {
          const pending = state.pending[channel]!;
          if (pending.kind === "lines") {
            state = commitLine(state, channel, beats);
          } else if (pending.kind === "reply") {
            state = commitReply(state, channel, beats);
            played.push(pending.beatId);
          } else {
            const beat = beatById!.get(pending.beatId)!;
            const matrix = /[MF]201$/.test(beat.id);
            if (matrix) {
              expect(beat.choices).toHaveLength(2);
              expect(choiceMemoryGate(state, channel, beat.choices![1])).toBe(route[channel].route === "E" ? "相关旧记忆" : null);
            }
            const index = matrix ? Number(route[channel].route !== "E") : /[MF]101$/.test(beat.id) ? Number(!route[channel].useDaily) : 0;
            state = choose(state, channel, index, beats);
            if (matrix) {
              saveProgress(state);
              state = loadProgress(beats)!;
            }
          }
          continue;
        }
        const next = playbackStep(state, beats);
        if (!next) break;
        state = openChannel(state, next.channel, beats);
      }
      const outcome = (left.route === "E" ? "E" : "R") + (right.route === "E" ? "E" : "R");
      expect(state.endings).toContain(outcome === "EE" ? "分手" : "和好");
      expect(state.endings).not.toContain(outcome === "EE" ? "和好" : "分手");
      expect(played).toContain("8m.M202" + left.route);
      expect(played).toContain("8f.F202" + right.route);
      expect(played).toContain(left.useDaily ? "8m.M102A" : "8m.M102B");
      expect(played).toContain(right.useDaily ? "8f.F102A" : "8f.F102B");
      expect(played).toContain(outcome === "RE" ? "8f.F301RE" : "8f.F301" + (outcome === "EE" ? "E" : outcome));
      expect(played.map(id => beatById!.get(id)!.order)).toEqual(
        played.map(id => beatById!.get(id)!.order).sort((a, b) => a! - b!),
      );
      expect(state.chapter).toEqual({ left: 8, right: 8 });
      for (const channel of ["left", "right"] as const) {
        const finale = state.archive?.[channel].filter(entry => (entry.section ?? 0) >= 7);
        expect(finale?.map(entry => entry.section)).toEqual([7, 8, 9]);
        expect(finale?.flatMap(entry => entry.beatIds)).toEqual(played.filter(id => beatById!.get(id)?.channel === channel));
      }
    }
  }
});
