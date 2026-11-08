import { beforeEach, describe, expect, it } from "vitest";
import { consumeLoadNotice, loadProgress, saveProgress } from "./storage";
import { createInitial } from "./scheduler";
import type { Beat, EngineState } from "./types";

const beats: Beat[] = [
  {
    id: "L1", channel: "left", chapter: 1,
    lines: [{ from: "boy", text: "你好", delivery: "pop" }],
    choices: [{ thought: "回一句", reply: "好的", next: "L2" }],
  },
  { id: "L2", channel: "left", chapter: 2, lines: [{ from: "boy", text: "接着", delivery: "pop" }] },
];

const KEY = "shuangxian.progress.v2";

beforeEach(() => {
  localStorage.clear();
  consumeLoadNotice();
});

describe("存档 v2", () => {
  it("写入读出能保住显式章号、仪式与终局", () => {
    const state: EngineState = {
      ...createInitial(beats),
      chapter: { left: 1, right: 2 },
      ritual: { left: { from: 1, to: 2, phase: "mask", until: 123456 }, right: null },
      endings: ["在一起"],
      memories: { left: [{ label: "店的位置", text: "老位置", beatId: "L1" }], right: [] },
      runId: 3,
    };
    saveProgress(state);
    const loaded = loadProgress(beats);
    expect(loaded).not.toBeNull();
    expect(loaded?.chapter).toEqual({ left: 1, right: 2 });
    expect(loaded?.ritual.left?.until).toBe(123456);
    expect(loaded?.endings).toEqual(["在一起"]);
    expect(loaded?.memories.left[0].label).toBe("店的位置");
    expect(loaded?.runId).toBe(3);
  });

  it("v1 旧档给出明确提示并重置，不静默清档", () => {
    localStorage.setItem("shuangxian.progress.v1", JSON.stringify({ state: {} }));
    expect(loadProgress(beats)).toBeNull();
    expect(consumeLoadNotice()).toContain("剧本已更新");
    expect(localStorage.getItem("shuangxian.progress.v1")).toBeNull();
  });

  it("旧档里的拍 id 已不存在时提示并重置", () => {
    localStorage.setItem(KEY, JSON.stringify({
      version: 2,
      state: { ...createInitial(beats), completed: ["5m.1.11"] },
    }));
    expect(loadProgress(beats)).toBeNull();
    expect(consumeLoadNotice()).toContain("旧进度里的节拍已不存在");
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("新档缺字段时按缺省补齐，不把整档丢掉", () => {
    const partial = {
      ...createInitial(beats),
      chapter: undefined,
      ritual: undefined,
      endings: undefined,
      runId: undefined,
    };
    localStorage.setItem(KEY, JSON.stringify({ version: 2, state: partial }));
    const loaded = loadProgress(beats);
    expect(loaded).not.toBeNull();
    expect(loaded?.chapter).toEqual({ left: 1, right: 1 });
    expect(loaded?.ritual).toEqual({ left: null, right: null });
    expect(loaded?.endings).toEqual([]);
    expect(loaded?.runId).toBe(0);
  });
});
