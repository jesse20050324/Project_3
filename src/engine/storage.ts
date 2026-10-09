import { isRoot } from "./scheduler";
import type { Beat, EngineState } from "./types";

const KEY = "shuangxian.progress.v1";

export function saveProgress(state: EngineState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, state }));
  } catch (error) {
    console.error(error);
  }
}

export function clearProgress(): void {
  try {
    localStorage.removeItem(KEY);
  } catch (error) {
    console.error(error);
  }
}

export function loadProgress(beats: Beat[]): EngineState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.state)) {
      clearProgress();
      return null;
    }
    const state = parsed.state as EngineState;
    if (!isUsable(state, beats)) {
      clearProgress();
      return null;
    }
    const activated = [...state.activated];
    for (const beat of beats) {
      if (!isRoot(beat, beats) || state.completed.includes(beat.id) || activated.includes(beat.id)) continue;
      activated.push(beat.id);
    }
    return {
      ...state,
      activated,
      pending: {
        left: state.pending.left ?? null,
        right: state.pending.right ?? null,
      },
    };
  } catch {
    clearProgress();
    return null;
  }
}

function isUsable(state: EngineState, beats: Beat[]): boolean {
  const ids = new Set(beats.map((beat) => beat.id));
  if (!Array.isArray(state.completed) || !state.completed.every((id) => ids.has(id))) return false;
  if (!Array.isArray(state.activated) || !state.activated.every((id) => ids.has(id))) return false;
  if (!Array.isArray(state.messages)) return false;
  if (!isRecord(state.flags) || !isRecord(state.pending)) return false;
  for (const message of state.messages) {
    if (!isRecord(message)) return false;
    if (message.channel !== "left" && message.channel !== "right") return false;
    if (typeof message.text !== "string" || typeof message.id !== "string") return false;
    if (message.delivery !== "type" && message.delivery !== "pop" && message.delivery !== "image" && message.delivery !== "thought") return false;
  }
  for (const channel of ["left", "right"] as const) {
    const pending = state.pending[channel];
    if (pending === null || pending === undefined) continue;
    if (!isRecord(pending)) return false;
    if (pending.kind !== "lines" && pending.kind !== "choices" && pending.kind !== "reply") return false;
    if (typeof pending.beatId !== "string" || !ids.has(pending.beatId)) return false;
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
