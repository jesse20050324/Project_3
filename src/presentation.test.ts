import { describe, expect, it } from "vitest";
import { DEFAULT_PACING, PACING, pacingError, resolveTiming, ZERO_TIMING } from "./presentation";
import type { PacingValue } from "./engine/types";

describe("逐消息节拍的三层解析", () => {
  it("章默认 → 拍默认 → 逐句覆盖，逐层生效", () => {
    const chapterOnly = resolveTiming(["正常"]);
    expect(chapterOnly).toEqual(PACING.正常);

    const beatPreset = resolveTiming(["正常", "慢"]);
    expect(beatPreset).toEqual(PACING.慢);

    const lineOverride = resolveTiming(["正常", "慢", { pauseBeforeMs: 1500 }]);
    expect(lineOverride).toEqual({ ...PACING.慢, pauseBeforeMs: 1500 });

    expect(resolveTiming([undefined, undefined, undefined])).toEqual(PACING[DEFAULT_PACING]);
  });

  it("预设名与数值覆盖混用时，数值只改指定字段", () => {
    const value = resolveTiming(["快", { typeIntervalMs: 250 }]);
    expect(value.typeIntervalMs).toBe(250);
    expect(value.indicatorMs).toBe(PACING.快.indicatorMs);
  });

  it("减弱动效时全部归零", () => {
    expect(resolveTiming(["长停顿", { pauseBeforeMs: 9999 }], true)).toEqual(ZERO_TIMING);
  });

  it("未知预设名、未知字段、越界数值都会被拒", () => {
    expect(pacingError("不存在的预设")).toContain("未知节拍预设");
    expect(pacingError({ pauseBeforeMs: -1 })).toContain("0~20000");
    expect(pacingError({ unknownMs: 10 } as unknown as PacingValue)).toContain("未知字段");
    expect(pacingError("正常")).toBeNull();
    expect(pacingError({ afterMs: 1200 })).toBeNull();
  });
});
