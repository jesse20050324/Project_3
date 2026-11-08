import { describe, expect, it } from "vitest";
import { loadBundledScript } from "./loadScript";
import { simulateScript } from "./simulate";

describe("全剧本可达性仿真（CH1-CH5）", () => {
  it("剧本能通过严格解析与启动校验", () => {
    const { script, error } = loadBundledScript();
    expect(error).toBeNull();
    expect(script).not.toBeNull();
  });

  it("穷举所有分支：无死锁、无区间越界、无播不到的拍，终局可抵达", () => {
    const { script } = loadBundledScript();
    if (!script) throw new Error("剧本加载失败");
    const result = simulateScript(script, { autoSave: true });
    if (!result.ok) {
      throw new Error(`仿真失败：\n${result.errors.join("\n")}\n已访问 ${result.visitedBeats.size} 拍`);
    }
    expect(result.ok).toBe(true);
    expect(result.endings).toContain("在一起");
    expect(result.chapterTransitions).toBeGreaterThan(0);
    expect(result.unvisitedBeats).toEqual([]);
    expect(result.states).toBeGreaterThan(20);
  });

  it("玩家完全不存记忆时也不会死锁", () => {
    const { script } = loadBundledScript();
    if (!script) throw new Error("剧本加载失败");
    const result = simulateScript(script, { autoSave: false });
    expect(result.errors.filter((message) => !message.includes("播不到"))).toEqual([]);
  });

  it("第五章的 40 拍都在仿真里出现过", () => {
    const { script } = loadBundledScript();
    if (!script) throw new Error("剧本加载失败");
    const result = simulateScript(script, { autoSave: true });
    const chapter5 = script.beats.filter((beat) => beat.chapter === 5);
    expect(chapter5.length).toBe(40);
    const missing = chapter5.filter((beat) => !result.visitedBeats.has(beat.id)).map((beat) => beat.id);
    expect(missing).toEqual([]);
  });
});
