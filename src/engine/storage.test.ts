import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadBundledScript } from "./loadScript";
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
  it("独立试玩使用专属存档，读取和清除都不影响正式站", async () => {
    const state = createInitial(beats);
    saveProgress(state);
    const mainSave = localStorage.getItem(KEY);
    localStorage.setItem("shuangxian.progress.v1", "legacy");

    vi.stubEnv("VITE_SAVE_NAMESPACE", "he-said-she-said-ui-test");
    vi.resetModules();
    try {
      const preview = await import("./storage");
      expect(preview.hasProgress()).toBe(false);
      expect(preview.loadProgress(beats)).toBeNull();
      preview.saveProgress({ ...state, runId: 4 });
      expect(preview.loadProgress(beats)?.runId).toBe(4);
      preview.clearProgress();
      expect(preview.hasProgress()).toBe(false);
      expect(localStorage.getItem(KEY)).toBe(mainSave);
      expect(localStorage.getItem("shuangxian.progress.v1")).toBe("legacy");
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

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

  it("旧档把聚会的多个章节归成一段，转换跨章仪式并保留两侧独立进度", () => {
    const { script } = loadBundledScript();
    if (!script) throw new Error("剧本加载失败");
    const state = createInitial(script.beats);
    const leftBeats = ["L1", "3.1.1-A", "4.2.1"];
    saveProgress({
      ...state,
      completed: [...leftBeats, "R1-shiguang"],
      activated: ["5m.1.1-A"],
      flags: { 男生意向: "问", 女生意向: "问" },
      chapter: { left: 4, right: 1 },
      ritual: {
        left: { from: 4, to: 5, phase: "mask", until: 3200 },
        right: { from: 1, to: 3, phase: "mask", until: 3200 },
      },
      archive: {
        left: leftBeats.map((id, index) => ({ chapter: [1, 3, 4][index], beatIds: [id] })),
        right: [{ chapter: 1, beatIds: ["R1-shiguang"] }],
      },
    });
    const migrated = loadProgress(script.beats)!;
    expect(migrated.context).toEqual({ left: 1, right: 1 });
    expect(migrated.ritual.right).toBeNull();
    expect(migrated.archive?.right).toEqual([]);
    expect(migrated.ritual.left).toMatchObject({ contextTo: 2, phase: "mask" });
    expect(migrated.archive?.left).toEqual([{ chapter: 1, section: 1, beatIds: leftBeats }]);
    saveProgress(migrated);
    expect(loadProgress(script.beats)?.archive).toEqual(migrated.archive);
  });

  it("第五幕旧档仅撤下停用候选，保留双窗进度和其余记忆", () => {
    const { script } = loadBundledScript();
    if (!script) throw new Error("剧本加载失败");
    const left = { label: "都会回", text: "她回得慢但都会回", beatId: "5m.2.1" };
    const rightBeat = script.beats.find(beat => beat.记忆候选?.some(item => item.缩略标签 === "同桌是表妹"))!;
    const right = { label: "同桌是表妹", text: rightBeat.记忆候选![0].短句, beatId: rightBeat.id };
    const state: EngineState = {
      ...createInitial(script.beats),
      chapter: { left: 5, right: 5 },
      completed: ["5m.4.4", "5f.4.4"],
      endings: ["在一起"],
      memories: {
        left: [left, { label: "猫叫煤球", text: "她的猫踩着键盘抢镜，叫煤球", beatId: "5m.2.1" }],
        right: [right, { label: "头像是小熊", text: "他头像是只小熊，看着挺憨", beatId: "5f.1.3" }],
      },
    };
    saveProgress(state);
    const loaded = loadProgress(script.beats);
    expect(loaded?.completed).toEqual(state.completed);
    expect(loaded?.chapter).toEqual(state.chapter);
    expect(loaded?.endings).toEqual(state.endings);
    expect(loaded?.memories).toEqual({ left: [left], right: [right] });
  });

  it("换店旧档撤下无效地址并能继续到店，已经播过的男窗不重复播", () => {
    const { script } = loadBundledScript();
    if (!script) throw new Error("剧本加载失败");
    const old = createInitial(script.beats);
    old.chapter = { left: 3, right: 3 };
    old.completed = ["R1-shiguang", "3.4.1", "3.3.1"];
    old.memories.right = [{ label: "店的位置", text: "小寨华旗国际A座", beatId: "R1-shiguang" }];
    saveProgress(old);
    const resumed = loadProgress(script.beats);
    expect(resumed?.completed).toContain("3.4.arrived");
    expect(resumed?.activated).not.toContain("3.3.1-A");
    expect(resumed?.memories.right).toEqual([]);
  });
});
