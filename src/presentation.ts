import type { Delivery } from "./engine/types";

export const TYPE_INTERVAL_MS = 280;

/** How long a finished typed line stays before the next one starts. */
export const AFTER_TYPE_MS = 2800;

export const INDICATOR_MS: Record<Delivery, number> = {
  type: 2800,
  pop: 2200,
  image: 0,
  thought: 2000,
};

export function shouldType(delivery: Delivery, reduceMotion: boolean): boolean {
  return delivery === "type" && !reduceMotion;
}
