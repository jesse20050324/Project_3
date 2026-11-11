import { describe, expect, it } from "vitest";
import {
  availableBeat, canArm, choose, commitLine, commitReply, createInitial,
  detectWindowViolation, hasMemory, openChannel, playbackStep, ritualTick, saveMemory,
} from "./scheduler";
import { assignSchedule } from "./timeline";
import type { Beat, EngineState, Script } from "./types";

function line(text: string) {
  return [{ from: "boy", text, delivery: "pop" as const }];
}

function mk(id: string, channel: "left" | "right", extra: Partial<Beat> = {}): Beat {
  return { id, channel, lines: line(id), ...extra };
}

function prepare(beats: Beat[]): { script: Script; beats: Beat[]; initial: EngineState } {
  const script = assignSchedule({ title: "测试", speakers: [], beats });
  return { script, beats: script.beats, initial: createInitial(script.beats) };
}

const fork = (id: string, next: string) => ({ thought: `想${id}`, reply: `回${id}`, next });

describe("全局时序调度", () => {
  it("按剧本排序键选下一拍，而不是固定左窗优先", () => {
    const { beats, initial } = prepare([
      mk("m2", "left", { order: 20, choices: [fork("m2", "m3")] }),
      mk("f1", "right", { order: 5, choices: [fork("f1", "f2")] }),
      mk("m3", "left", { order: 30 }),
      mk("f2", "right", { order: 40 }),
    ]);
    expect(playbackStep(initial, beats)?.channel).toBe("right");
  });

  it("对面正在播出时本窗不放行（一活一锁）", () => {
    const { beats, initial } = prepare([
      mk("m1", "left", { order: 1, choices: [fork("m1", "m2")] }),
      mk("f1", "right", { order: 2, choices: [fork("f1", "f2")] }),
      mk("m2", "left", { order: 3 }),
      mk("f2", "right", { order: 4 }),
    ]);
    const playing: EngineState = {
      ...initial,
      pending: { left: { kind: "lines", beatId: "m1", lineIndex: 0 }, right: null },
    };
    expect(canArm(playing, "right", beats)).toBe(false);
    expect(playbackStep(playing, beats)).toBeNull();
  });

  it("播完一拍不再自动接下一拍（这正是女线 16 拍播不到的旧根因）", () => {
    const { beats, initial } = prepare([
      mk("m1", "left", { order: 1, next: "m2" }),
      mk("f1", "right", { order: 2 }),
      mk("m2", "left", { order: 3 }),
    ]);
    const armed = openChannel(initial, "left", beats, 0);
    const done = commitLine(armed, "left", beats);
    expect(done.pending.left).toBeNull();
    expect(done.completed).toEqual(["m1"]);
    // 下一拍由 playbackStep 全局裁决，而不是在本窗里偷偷接上
    expect(playbackStep(done, beats)).toEqual({ type: "arm", channel: "right" });
  });

  it("等待门未满足时该侧 locked 且没有可播拍", () => {
    const { beats, initial } = prepare([
      mk("m1", "left", { order: 1, choices: [fork("m1", "m2")] }),
      mk("f1", "right", { order: 2, requires: ["m1"], choices: [fork("f1", "f2")] }),
      mk("m2", "left", { order: 3 }),
      mk("f2", "right", { order: 4 }),
    ]);
    expect(availableBeat(initial, "right", beats)).toBeNull();
    expect(playbackStep(initial, beats)?.channel).toBe("left");
  });

  it("第五幕较晚的拍等待对窗先完成切章及入场选择", () => {
    const { beats, initial } = prepare([
      mk("old-left", "left", { chapter: 4 }),
      mk("old-right", "right", { chapter: 4 }),
      mk("left-entry", "left", { chapter: 5, order: 2 }),
      mk("right-entry", "right", { chapter: 5, order: 1, choices: [fork("entry", "right-next")] }),
      mk("right-next", "right", { chapter: 5, order: 3 }),
    ]);
    const ready = { ...initial, completed: ["old-left", "old-right"] };
    const rightReset = openChannel(ready, "right", beats, 0);
    const bothReset = openChannel(rightReset, "left", beats, 0);
    const leftPaused = ritualTick(bothReset, "left", 2200);
    const leftReady = ritualTick(leftPaused, "left", 4200);
    expect(playbackStep(leftReady, beats)).toBeNull();
    const rightPaused = ritualTick(leftReady, "right", 2200);
    const rightReady = ritualTick(rightPaused, "right", 4200);
    expect(playbackStep(rightReady, beats)?.channel).toBe("right");
    const rightChoice = commitLine(openChannel(rightReady, "right", beats), "right", beats);
    expect(rightChoice.pending.right?.kind).toBe("choices");
    expect(playbackStep(rightChoice, beats)).toBeNull();
    const chosen = commitReply(choose(rightChoice, "right", 0, beats), "right", beats);
    expect(playbackStep(chosen, beats)?.channel).toBe("left");
  });
});

describe("区间门", () => {
  const gated = mk("f6", "right", {
    order: 6,
    window: { channel: "left", 下界: ["m3"], 上界: ["m10"] },
    choices: [fork("f6", "f7")],
  });

  it("下界未到、区间内、超界分别对应不放行／放行／报错", () => {
    const { beats, initial } = prepare([
      mk("m3", "left", { order: 3 }),
      mk("m10", "left", { order: 10 }),
      gated,
      mk("f7", "right", { order: 7 }),
    ]);
    expect(availableBeat(initial, "right", beats)).toBeNull();

    const inRange: EngineState = { ...initial, completed: ["m3"], activated: [...initial.activated, "f6"] };
    expect(availableBeat(inRange, "right", beats)?.id).toBe("f6");

    const tooLate: EngineState = { ...inRange, completed: ["m3", "m10"] };
    expect(availableBeat(tooLate, "right", beats)).toBeNull();
    expect(detectWindowViolation(tooLate, beats)).toContain("区间越界");
  });
});

describe("跨章仪式：状态持久化，刷新可恢复", () => {
  it("跨章先进入 mask，tick 清记录并切章，再 tick 结束；全程不需要刷新", () => {
    const { beats, initial } = prepare([
      mk("a1", "left", { chapter: 1, order: 1, choices: [fork("a1", "b1")] }),
      mk("b1", "left", { chapter: 2, order: 2, choices: [fork("b1", "b2")] }),
      mk("b2", "left", { chapter: 2, order: 3 }),
    ]);
    const withMessage: EngineState = {
      ...initial,
      chapter: { left: 1, right: 1 },
      completed: ["a1"],
      activated: [...initial.activated, "b1"],
      messages: [{ id: "old", channel: "left", beatId: "a1", from: "boy", text: "旧章消息", delivery: "pop" }],
    };
    const masked = openChannel(withMessage, "left", beats, 1000);
    expect(masked.ritual.left).toEqual({ from: 1, to: 2, phase: "mask", until: 1000 + 2200 });
    expect(masked.pending.left).toBeNull();

    const paused = ritualTick(masked, "left", 1000 + 2200);
    expect(paused.ritual.left?.phase).toBe("pause");
    expect(paused.chapter.left).toBe(2);
    expect(paused.messages.filter((message) => message.channel === "left")).toHaveLength(0);

    const cleared = ritualTick(paused, "left", 1000 + 2200 + 2000);
    expect(cleared.ritual.left).toBeNull();
    expect(openChannel(cleared, "left", beats, 0).pending.left?.beatId).toBe("b1");
  });

  it("到期之前 tick 是幂等的", () => {
    const state = createInitial([]);
    const withRitual: EngineState = {
      ...state,
      ritual: { left: { from: 1, to: 2, phase: "mask", until: 5000 }, right: null },
    };
    expect(ritualTick(withRitual, "left", 1000)).toBe(withRitual);
  });
});

describe("选项、记忆与终局", () => {
  it("置灰门要求本窗已存记忆", () => {
    const { beats, initial } = prepare([
      mk("a1", "left", {
        order: 1,
        choices: [
          { thought: "有记忆才行", reply: "回A", next: "a2", 需记忆: "店的位置" },
          { thought: "随便走", reply: "回B", next: "a2" },
        ],
      }),
      mk("a2", "left", { order: 2 }),
    ]);
    const atChoice: EngineState = { ...initial, pending: { left: { kind: "choices", beatId: "a1" }, right: null } };
    expect(() => choose(atChoice, "left", 0, beats)).toThrow(/需要记忆/);
    const saved = saveMemory(atChoice, "left", { label: "店的位置", text: "老位置", beatId: "a1" });
    expect(hasMemory(saved, "left", "店的位置")).toBe(true);
    expect(() => choose(saved, "left", 0, beats)).not.toThrow();
  });

  it("选项回复按自己的 Timing 播出，双窗共同终局才达成", () => {
    const { beats, initial } = prepare([
      mk("mEnd", "left", { order: 1, ending: "在一起", choices: [{ thought: "好", reply: "回复" }] }),
      mk("fEnd", "right", { order: 2, ending: "在一起", choices: [{ thought: "好", reply: "回复" }] }),
    ]);
    let state: EngineState = { ...initial, activated: ["mEnd", "fEnd"] };
    state = openChannel(state, "left", beats, 0);
    state = commitLine(state, "left", beats);
    state = choose(state, "left", 0, beats);
    state = commitReply(state, "left", beats);
    expect(state.endings).toEqual([]);

    state = openChannel(state, "right", beats, 0);
    state = commitLine(state, "right", beats);
    state = choose(state, "right", 0, beats);
    state = commitReply(state, "right", beats);
    expect(state.endings).toEqual(["在一起"]);
  });
});
