import type { Delivery } from "./engine/types";

export const TYPE_INTERVAL_MS = 90;

/** How long a finished typed line stays before the next one starts. */
export const AFTER_TYPE_MS = 900;

export const INDICATOR_MS: Record<Delivery, number> = {
  type: 1200,
  pop: 800,
  image: 0,
  thought: 700,
};

export function shouldType(delivery: Delivery, reduceMotion: boolean): boolean {
  return delivery === "type" && !reduceMotion;
}
