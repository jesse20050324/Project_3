import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ArchiveEntry, Channel, EngineState, MemoryEntry, Script } from "../engine/types";
import { summariesFor } from "../contextSummaries";
import { ritualElapsed } from "../terminalMotion";
import { memoryCapacity, storyOutcome } from "../engine/scheduler";
import { terminalUsers } from "../terminalIdentity";

const channels = ["left", "right"] as const;

const summaryDuration = 3400;

export type MemoryReplacement = { channel: Channel; entry: MemoryEntry };

export function TerminalArchive({ script, state, now, reduced, replacement, onCancelReplacement, onReplace, onForget }: {
  script: Script; state: EngineState; now: number; reduced: boolean;
  replacement?: MemoryReplacement;
  onCancelReplacement: () => void;
  onReplace: (label: string) => void;
  onForget: (channel: Channel, label: string) => void;
}) {
  const [folders, setFolders] = useState({ left: true, right: true });
  const [sessions, setSessions] = useState<Record<string, boolean>>({});
  const leftReset = state.ritual.left?.from;
  const rightReset = state.ritual.right?.from;
  const ended = Boolean(storyOutcome(state));
  const { left: leftChapter, right: rightChapter } = state.chapter;
  const scroll = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const scroller = scroll.current;
    const writing = [...(scroller?.querySelectorAll<HTMLElement>("[data-recording]") ?? [])].at(-1);
    if (!scroller || !writing) return;
    const bounds = scroller.getBoundingClientRect();
    const entry = writing.getBoundingClientRect();
    if (entry.bottom > bounds.bottom) scroller.scrollTop += entry.bottom - bounds.bottom;
    else if (entry.top < bounds.top) scroller.scrollTop += entry.top - bounds.top;
  }, [leftReset, rightReset, folders, sessions, now]);
  useEffect(() => {
    setFolders({ left: true, right: true });
    setSessions({});
  }, [state.runId]);
  useEffect(() => {
    if (leftReset !== undefined) {
      setFolders(previous => ({ ...previous, left: true }));
      setSessions(previous => ({ ...previous, [`left:${leftReset}`]: true }));
    }
    if (rightReset !== undefined) {
      setFolders(previous => ({ ...previous, right: true }));
      setSessions(previous => ({ ...previous, [`right:${rightReset}`]: true }));
    }
    if (ended) {
      setFolders({ left: true, right: true });
      setSessions(previous => ({ ...previous, [`left:${leftChapter}`]: true, [`right:${rightChapter}`]: true }));
    }
  }, [leftReset, rightReset, ended, leftChapter, rightChapter, state.runId]);
  useEffect(() => {
    if (replacement) setFolders(previous => ({ ...previous, [replacement.channel]: true }));
  }, [replacement]);
  useLayoutEffect(() => {
    if (replacement) scroll.current?.querySelector<HTMLButtonElement>("[data-replacement-option]")?.focus();
  }, [replacement, folders]);

  return <aside className="archive terminal-column" aria-label="Context Store · Summary / Memory" data-testid="terminal-archive">
    <header className="pane-head ascii-rule"><span className="pane-name">CONTEXT STORE</span>
      <span className="archive-kind">SUMMARY / MEMORY</span>
    </header>
    <div className="archive-scroll" ref={scroll}>
      {channels.map(channel => {
        const entries = state.archive?.[channel] ?? [];
        const memories = state.memories[channel];
        const loose = memories.filter(memory => !entries.some(entry => entry.beatIds.includes(memory.beatId)));
        const ritual = state.ritual[channel];
        const incoming = replacement?.channel === channel ? replacement.entry : undefined;
        const forget = memoryCapacity(state, channel) !== undefined
          ? (label: string) => onForget(channel, label) : undefined;
        return <div className="archive-folder" key={channel}>
          <button className="tree-toggle" aria-expanded={folders[channel]} type="button"
            onClick={() => setFolders(previous => ({ ...previous, [channel]: !previous[channel] }))}>
            <span aria-hidden="true">{folders[channel] ? "[-]" : "[+]"}</span> USER {terminalUsers[channel].id} / {terminalUsers[channel].name}
          </button>
          {folders[channel] ? <div className="archive-branches">
            {incoming ? <div className="archive-replacement" aria-label="替换记忆">
              <p>[MEM] 已满 · 选择一条替换为「{incoming.label}」</p>
              {memories.map(memory => <button key={memory.label} type="button" className="tree-toggle"
                data-replacement-option onClick={() => onReplace(memory.label)}>替换「{memory.label}」</button>)}
              <button type="button" className="memory-entry" onClick={onCancelReplacement}>[取消]</button>
            </div> : null}
            {!entries.length && !loose.length ?  <div className="muted">└ 尚无记录</div> : null}
            {loose.length ? <details className="archive-pending">
              <summary>[MEMORY] 当前会话 · {loose.length}</summary>
              {loose.map(memory => <ArchiveMemory key={memory.label} memory={memory} onForget={forget} />)}
            </details> : null}
            {entries.map(entry => {
              const key = `${channel}:${entry.chapter}`;
              const recording = ritual?.from === entry.chapter;
              const duration = recording && !reduced ? ritualElapsed(ritual, now) : summaryDuration;
              const title = script.chapters?.find(item => item.index === entry.chapter)?.title;
              return <div key={key} className="archive-session" data-recording={recording || undefined}>
                <button className="tree-toggle" aria-expanded={Boolean(sessions[key])} type="button"
                  onClick={() => setSessions(previous => ({ ...previous, [key]: !previous[key] }))}>
                  <span aria-hidden="true">{sessions[key] ? "[-]" : "[+]"}</span> {title?.replace(/^第[一二三四五六七八九十\d]+[幕章]\s*·\s*/, "") ?? "会话记录"}
                </button>
                {sessions[key] ? <ArchiveSession entry={entry} memories={memories} elapsed={duration} onForget={forget} /> : null}
              </div>;
            })}
          </div> : null}
        </div>;
      })}
    </div>
  </aside>;
}

function ArchiveSession({ entry, memories, elapsed, onForget }: {
  entry: ArchiveEntry; memories: MemoryEntry[]; elapsed: number; onForget?: (label: string) => void;
}) {
  const summaries = useMemo(() => summariesFor(entry), [entry]);
  const segments = useMemo(() => summaries.map(summary => Array.from(summary.text)), [summaries]);
  const total = segments.reduce((sum, chars) => sum + chars.length + 3, 0);
  let budget = Math.floor(Math.max(0, Math.min(1, elapsed / summaryDuration)) * total);
  return <div className="archive-segments">
    {elapsed < summaryDuration ? <p className="archive-writing"><span aria-hidden="true">[CTX]</span> 正在收录…</p> : null}
    {summaries.map((summary, index) => {
      const chars = segments[index];
      const count = Math.max(0, Math.min(budget, chars.length));
      budget -= chars.length + 3;
      if (!count) return null;
      return <div className="archive-segment" key={summary.beatIds[0]}>
        <span aria-hidden="true">{index === summaries.length - 1 ? "└" : "├"}</span>
        <div>
          {chars.slice(0, count).join("")}
          {count < chars.length ? <span className="caret" aria-hidden="true" /> : null}
          {count === chars.length ? memories.filter(memory => summary.beatIds.includes(memory.beatId))
            .map(memory => <ArchiveMemory key={memory.label} memory={memory} onForget={onForget} />) : null}
        </div>
      </div>;
    })}
  </div>;
}

function ArchiveMemory({ memory, onForget }: { memory: MemoryEntry; onForget?: (label: string) => void }) {
  return <details className="archive-memory">
    <summary>[MEM] {memory.label}</summary>
    <p>「{memory.text}」</p>
    {onForget ? <button type="button" className="memory-entry memory-action"
      aria-label={`舍弃「${memory.label}」`} onClick={() => onForget(memory.label)}>[舍弃]</button> : null}
  </details>;
}
