import { isContextSection, type ContextSection } from "./contextSections";
import type { ArchiveEntry, Beat, Channel, EngineState } from "./types";

const channels = ["left", "right"] as const;

export function recordContext(state: EngineState, channel: Channel, beats: Beat[]): EngineState {
  const list = state.archive?.[channel] ?? [];
  const section = state.context?.[channel];
  const chapter = state.chapter[channel];
  if (list.some(entry => section === undefined ? entry.chapter === chapter : entry.section === section)) return state;
  const visible = state.messages
    .filter(message => message.channel === channel && message.delivery !== "thought")
    .map(message => message.beatId);
  // Older saves may have cleared some messages within what is now one section.
  const beatIds = section === undefined
    ? [...new Set(visible)]
    : visibleBeats(beats, channel, [...state.completed, ...visible])
      .filter(beat => beat.context?.section === section).map(beat => beat.id);
  if (beatIds.length === 0) return state;
  const entry = { chapter: beats.find(beat => beat.id === beatIds[0])?.chapter ?? chapter, beatIds,
    ...(section === undefined ? {} : { section }) };
  return { ...state, archive: { left: [], right: [], ...state.archive, [channel]: [...list, entry] } };
}

function visibleBeats(beats: Beat[], channel: Channel, ids: string[]): Beat[] {
  const byId = new Map(beats.map(beat => [beat.id, beat]));
  return [...new Set(ids)].flatMap(id => {
    const beat = byId.get(id);
    return beat?.channel === channel && !beat.control ? [beat] : [];
  });
}

export function migrateContext(state: EngineState, beats: Beat[], targetFor: (channel: Channel) => Beat | null): EngineState {
  if (state.context !== undefined || !beats.some(beat => beat.context)) return state;
  const context: NonNullable<EngineState["context"]> = {};
  const ritual = { ...state.ritual };
  const archive = { left: state.archive?.left ?? [], right: state.archive?.right ?? [] };
  const ended = state.endings.some(id => ["未交换微信", "分手", "和好"].includes(id));
  for (const channel of channels) {
    const played = visibleBeats(beats, channel, [
      ...archive[channel].flatMap(entry => entry.beatIds),
      ...state.completed,
      ...state.messages.filter(message => message.channel === channel).map(message => message.beatId),
      ...(state.pending[channel] ? [state.pending[channel].beatId] : []),
    ]);
    // Read the latest played segment even if some old chapter archives are missing.
    let current = played.reduce<ContextSection | undefined>((latest, beat) => {
      const section = beat.context?.section;
      return section !== undefined && (latest === undefined || section > latest) ? section : latest;
    }, undefined);
    let reset = ritual[channel];
    if (reset && reset.contextTo === undefined) {
      const target = targetFor(channel)?.context?.section;
      if (target === undefined || target === current || current === undefined) {
        reset = null;
      } else {
        reset = { ...reset, contextTo: target };
        if (reset.phase === "pause") current = target;
      }
    }
    if (current !== undefined) context[channel] = current;
    ritual[channel] = reset;
    const groups = new Map<ContextSection, ArchiveEntry>();
    for (const beat of played) {
      const section = beat.context?.section;
      if (section === undefined || current === undefined || section > current) continue;
      if (section === current && !ended && reset?.phase !== "mask") continue;
      const entry = groups.get(section) ?? { chapter: beat.chapter ?? 1, section, beatIds: [] };
      entry.beatIds.push(beat.id);
      groups.set(section, entry);
    }
    archive[channel] = [...groups.values()].sort((a, b) => a.section! - b.section!);
  }
  const byId = new Map(beats.map(beat => [beat.id, beat]));
  const messages = state.messages.filter(message => {
    const section = byId.get(message.beatId)?.context?.section;
    return section === undefined || section === context[message.channel];
  });
  return { ...state, archive, context, ritual, messages };
}

export function normalizeArchive(value: unknown, beats: Beat[]): Record<Channel, ArchiveEntry[]> {
  const result: Record<Channel, ArchiveEntry[]> = { left: [], right: [] };
  if (!value || typeof value !== "object") return result;
  const byId = new Map(beats.map(beat => [beat.id, beat]));
  for (const channel of channels) {
    const list = (value as Partial<Record<Channel, unknown>>)[channel];
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (!entry || !Number.isInteger(entry.chapter) || !Array.isArray(entry.beatIds)) continue;
      const section = isContextSection(entry.section) ? entry.section : undefined;
      if (result[channel].some(item => section === undefined
        ? item.section === undefined && item.chapter === entry.chapter : item.section === section)) continue;
      const ids = entry.beatIds.filter((id: unknown): id is string => {
        if (typeof id !== "string") return false;
        const beat = byId.get(id);
        return beat?.channel === channel && (section === undefined
          ? (beat.chapter ?? 1) === entry.chapter : beat.context?.section === section);
      });
      if (ids.length > 0) result[channel].push({
        chapter: entry.chapter, beatIds: [...new Set<string>(ids)], ...(section === undefined ? {} : { section }),
      });
    }
  }
  return result;
}
