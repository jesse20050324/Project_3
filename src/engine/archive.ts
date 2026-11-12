import type { ArchiveEntry, Beat, Channel, EngineState } from "./types";

export function recordContext(state: EngineState, channel: Channel, chapter: number): EngineState {
  const list = state.archive?.[channel] ?? [];
  if (list.some(entry => entry.chapter === chapter)) return state;
  const beatIds = [...new Set(state.messages
    .filter(message => message.channel === channel && message.delivery !== "thought")
    .map(message => message.beatId))];
  if (beatIds.length === 0) return state;
  return { ...state, archive: { left: [], right: [], ...state.archive, [channel]: [...list, { chapter, beatIds }] } };
}

export function normalizeArchive(value: unknown, beats: Beat[]): Record<Channel, ArchiveEntry[]> {
  const result: Record<Channel, ArchiveEntry[]> = { left: [], right: [] };
  if (!value || typeof value !== "object") return result;
  const byId = new Map(beats.map(beat => [beat.id, beat]));
  for (const channel of ["left", "right"] as const) {
    const list = (value as Partial<Record<Channel, unknown>>)[channel];
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (!entry || !Number.isInteger(entry.chapter) || !Array.isArray(entry.beatIds)
        || result[channel].some(item => item.chapter === entry.chapter)) continue;
      const ids = entry.beatIds.filter((id: unknown): id is string => {
        if (typeof id !== "string") return false;
        const beat = byId.get(id);
        return beat?.channel === channel && (beat.chapter ?? 1) === entry.chapter;
      });
      if (ids.length > 0) result[channel].push({ chapter: entry.chapter, beatIds: [...new Set<string>(ids)] });
    }
  }
  return result;
}
