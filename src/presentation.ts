import type { Delivery, PacingValue, Timing } from "./engine/types";

/**
 * 逐消息节拍的唯一调参入口。
 * 三层覆盖：全局预设（本文件） → 章默认（YAML 顶层 默认节拍）
 *          → 拍默认（beat.节拍） → 逐句/逐选项（line.节拍 / choice.节拍）。
 * 想整体变快变慢，改这里一处；想让某一条消息慢下来，在 overlay 里写一行。
 */
export const PACING: Record<string, Timing> = {
  极快: { pauseBeforeMs: 0, indicatorMs: 280, typeIntervalMs: 40, afterMs: 220 },
  快: { pauseBeforeMs: 100, indicatorMs: 600, typeIntervalMs: 65, afterMs: 450 },
  正常: { pauseBeforeMs: 240, indicatorMs: 1000, typeIntervalMs: 100, afterMs: 900 },
  慢: { pauseBeforeMs: 850, indicatorMs: 1500, typeIntervalMs: 145, afterMs: 1400 },
  长停顿: { pauseBeforeMs: 1700, indicatorMs: 2100, typeIntervalMs: 165, afterMs: 2100 },
};

export const DEFAULT_PACING = "正常";

/** 向后兼容：旧代码/旧测试引用的常量，降级为「正常」预设的兜底值。 */
export const TYPE_INTERVAL_MS = PACING[DEFAULT_PACING].typeIntervalMs;
export const AFTER_TYPE_MS = PACING[DEFAULT_PACING].afterMs;
export const INDICATOR_MS: Record<Delivery, number> = {
  type: PACING[DEFAULT_PACING].indicatorMs,
  pop: 800,
  image: 0,
  thought: 700,
};

export const ZERO_TIMING: Timing = {
  pauseBeforeMs: 0,
  indicatorMs: 0,
  typeIntervalMs: 0,
  afterMs: 0,
};

export function shouldType(delivery: Delivery, reduceMotion: boolean): boolean {
  return delivery === "type" && !reduceMotion;
}

export function isPresetName(value: PacingValue): value is string {
  return typeof value === "string";
}

/** 校验一个节拍值是否合法；返回错误说明，合法返回 null。 */
export function pacingError(value: PacingValue): string | null {
  if (typeof value === "string") {
    return PACING[value] ? null : `未知节拍预设「${value}」，可用：${Object.keys(PACING).join(" / ")}`;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return "节拍必须是预设名或数值对象";
  const keys: (keyof Timing)[] = ["pauseBeforeMs", "indicatorMs", "typeIntervalMs", "afterMs"];
  for (const [key, entry] of Object.entries(value)) {
    if (!keys.includes(key as keyof Timing)) return `节拍里有未知字段「${key}」`;
    if (typeof entry !== "number" || !Number.isFinite(entry) || entry < 0 || entry > 20000) {
      return `节拍.${key} 必须是 0~20000 之间的毫秒数`;
    }
  }
  return null;
}

/**
 * 从最不具体到最具体依次叠加：预设名整份替换，数值对象逐字段覆盖。
 * chain 顺序示例：[章默认, 拍默认, 逐句覆盖]。
 */
export function resolveTiming(chain: (PacingValue | undefined)[], reduceMotion = false): Timing {
  if (reduceMotion) return { ...ZERO_TIMING };
  let timing: Timing = { ...PACING[DEFAULT_PACING] };
  for (const value of chain) {
    if (value === undefined) continue;
    if (typeof value === "string") {
      const preset = PACING[value];
      if (preset) timing = { ...preset };
    } else {
      timing = { ...timing, ...value };
    }
  }
  return timing;
}
