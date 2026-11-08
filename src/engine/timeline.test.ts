import { describe, expect, it } from "vitest";
import { assignSchedule, compareBeats, scheduleOf, windowState, windowViolation } from "./timeline";
import type { Beat, Script } from "./types";

function beat(id: string, extra: Partial<Beat> = {}): Beat {
  return {
    id,
    channel: id.startsWith("f") ? "right" : "left",
    lines: [{ from: "boy", text: id, delivery: "pop" }],
    ...extra,
  };
}

function scriptOf(beats: Beat[]): Script {
  return { title: "测试", speakers: [{ id: "boy", name: "男生", channel: "left" }], beats };
}

describe("timeline：唯一排序真相", () => {
  it("显式 order 优先于文件顺序；缺省按文件顺序补", () => {
    const scheduled = assignSchedule(scriptOf([
      beat("m1", { chapter: 5, order: 10 }),
      beat("m2", { chapter: 5, order: 2 }),
      beat("m3", { chapter: 3 }),
    ]));
    const ids = scheduled.orderedBeats!.map((item) => item.id);
    expect(ids).toEqual(["m3", "m2", "m1"]);
    expect(scheduled.beatById!.get("m2")!.sortKey).toBe(5_000_002);
    const keys = scheduled.orderedBeats!.map(scheduleOf);
    expect(keys).toEqual([...keys].sort((a, b) => a - b));
  });

  it("时间档下标从该章顶层时间轴推导", () => {
    const scheduled = assignSchedule({
      ...scriptOf([beat("m1", { chapter: 5, time: "D2 晚" })]),
      axes: { 5: ["D1 傍晚", "D1 晚", "D2 晚"] },
    });
    expect(scheduled.beats[0].timeRank).toBe(2);
  });

  it("compareBeats 同键时按 id 稳定排序", () => {
    expect(compareBeats(beat("b"), beat("a"))).toBeGreaterThan(0);
    expect(compareBeats(beat("a"), beat("a"))).toBe(0);
  });
});

describe("区间门：下界未到 / 区间内 / 超界", () => {
  const target = beat("f6", {
    channel: "right",
    window: { channel: "left", 下界: ["m3"], 上界: ["m10"], 说明: "m3~m10 之间" },
  });

  it("下界没完成时是 waiting", () => {
    expect(windowState(target, new Set())).toBe("waiting");
  });

  it("下界完成、上界没完成时是 open，且此时先后无所谓", () => {
    expect(windowState(target, new Set(["m3", "m5", "m7"]))).toBe("open");
  });

  it("上界一旦完成就是 closed，并给出可行动的越界报错", () => {
    const done = new Set(["m3", "m10"]);
    expect(windowState(target, done)).toBe("closed");
    expect(windowViolation(target, done)).toContain("区间越界");
    expect(windowViolation(target, done)).toContain("m10");
  });

  it("本拍已完成就不再算越界", () => {
    expect(windowViolation(target, new Set(["m3", "m10", "f6"]))).toBeNull();
  });

  it("没有区间门的拍始终放行", () => {
    expect(windowState(beat("m1"), new Set())).toBe("none");
  });
});
