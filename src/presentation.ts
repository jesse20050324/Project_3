import type { Delivery } from "./engine/types";

export const TYPE_INTERVAL_MS = 22;

export const INDICATOR_MS: Record<Delivery, number> = {
  type: 560,
  pop: 280,
  image: 0,
};

export function shouldType(delivery: Delivery, reduceMotion: boolean): boolean {
  return delivery === "type" && !reduceMotion;
}
