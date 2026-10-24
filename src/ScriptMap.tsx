import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Beat, Channel, Choice, Line, Scalar, Script } from "./engine/types";
import { nameOf } from "./engine/loadScript";

const deliveryLabel: Record<Line["delivery"], string> = {
  type: "逐字出现",
  pop: "一下子出现",
  image: "图片",
  thought: "自言自语",
};

export type FlowNode = {
  id: string;
  gist: string;
  difference?: string;
  flag?: string;
  chapter?: number;
};

export type FlowRow =
  | { type: "node"; node: FlowNode }
  | { type: "note"; text: string }
  | { type: "fork"; title: string; nodes: FlowNode[] }
  | { type: "join" }
  | { type: "ends"; beatId: string; title: string; labels: string[] };

export type FlowChapter = {
  channel: Channel;
  title: string;
  rows: FlowRow[];
};

const COLUMN_W = 280;

export type SequenceCell = {
  nodes: FlowNode[];
  forkTitle?: string;
  joined?: boolean;
  note?: string;
  ends?: { beatId: string; title: string; labels: string[] };
  chapterLabel?: string;
};

export type SequenceLane = {
  channel: Channel;
  title: string;
  cells: Array<SequenceCell | null>;
};

export type SequenceBoard = {
  columns: number;
  lanes: SequenceLane[];
  columnOf: (id: string) => number;
};

export function ScriptMap({ script }: { script: Script }) {
  const board = sequenceBoard(script);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = script.beats.find((beat) => beat.id === openId) ?? null;
  const columns = { gridTemplateColumns: `repeat(${board.columns}, ${COLUMN_W}px)` };

  return (
    <div data-testid="script-map" className="h-full overflow-auto bg-[#e6e0d6] text-[#1c1915]">
      <header className="flex flex-wrap items-end justify-between gap-4 px-4 pt-6 md:px-8">
        <div>
          <p className="text-[11px] tracking-[0.2em] text-[#6b645b]">剧本结构</p>
          <h1 className="mt-1 text-[1.65rem] font-medium leading-tight">{script.title}</h1>
        </div>
        <a
          href="#"
          className="rounded-full border border-[#cfc6b8] px-3 py-1.5 text-xs text-[#3f4946] hover:border-[#1c1915] hover:bg-[#f7f4ee] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f5d54]"
        >
          回游戏
        </a>
      </header>
      <p className="max-w-xl px-4 pt-4 text-sm leading-7 text-[#5c564e] md:px-8">
        从左到右是顺序。要等的那一拍排在右边。同一列是同一步，上下对齐。叠在一列里的是分叉，不是先后。点开一格，才看原文。
      </p>
      <div className="mt-6 min-w-max pr-8">
        <div className="flex items-center pb-1 text-[11px] tracking-[0.14em] text-[#6b645b]">
          <div className="sticky left-0 w-16 shrink-0 bg-[#e6e0d6]" />
          <div className="flex items-center pl-1">
            <span>先发生</span>
            <span className="mx-3 h-px w-14 bg-[#2f5d54]" />
            <span>后发生</span>
          </div>
        </div>
        {board.lanes.map((lane, laneIndex) => {
          const marked = lane.cells.some((cell) => cell?.chapterLabel);
          return (
            <div key={lane.channel} data-testid={`flow-${lane.channel}`} className={`flex items-stretch ${laneIndex === 0 ? "mt-1" : "mt-8"}`}>
              <div className="sticky left-0 z-20 flex w-16 shrink-0 items-center justify-center bg-[#e6e0d6] text-sm font-medium">
                {lane.title}
              </div>
              <div>
                {marked ? (
                  <div className="grid" style={columns}>
                    {lane.cells.map((cell, index) => (
                      <div
                        key={index}
                        className={`flex h-7 items-end pb-1 pl-2 text-[11px] tracking-[0.18em] text-[#5c564e] ${cell?.chapterLabel ? "border-l border-[#5c564e]" : ""}`}
                      >
                        {cell?.chapterLabel ?? ""}
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="grid" style={columns}>
                  {lane.cells.map((cell, index) => (
                    <SequenceSlot key={index} cell={cell} link={laneLink(lane.cells, index)} openId={openId} onOpen={setOpenId} />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="px-4 py-8 md:px-8">
        {open ? (
          <BeatCard key={open.id} script={script} beat={open} onClose={() => setOpenId(null)} />
        ) : (
          <p className="text-sm text-[#6b645b]">点开一格，原文出现在这里。</p>
        )}
      </div>
    </div>
  );
}

function laneLink(cells: Array<SequenceCell | null>, index: number): { left: boolean; right: boolean } {
  const occupied = (cell: SequenceCell | null) => Boolean(cell && (cell.nodes.length > 0 || cell.ends));
  const before = cells.slice(0, index).some(occupied);
  const after = cells.slice(index + 1).some(occupied);
  const here = occupied(cells[index]);
  return { left: here ? before : before && after, right: here ? after : before && after };
}

function cueOf(cell: SequenceCell): { text: string; tone: "pine" | "muted" } | null {
  if (cell.ends && cell.nodes.length === 0) return { text: cell.ends.title, tone: "muted" };
  if (cell.nodes.length > 1) return { text: "分出去", tone: "pine" };
  if (cell.joined) return { text: "合回来", tone: "pine" };
  return null;
}

function footerOf(cell: SequenceCell | null): string | null {
  if (!cell) return null;
  return cell.note ?? cell.forkTitle ?? null;
}

function SequenceSlot({
  cell,
  link,
  openId,
  onOpen,
}: {
  cell: SequenceCell | null;
  link: { left: boolean; right: boolean };
  openId: string | null;
  onOpen: (id: string | null) => void;
}) {
  const occupied = Boolean(cell && (cell.nodes.length > 0 || cell.ends));
  const through = !occupied && link.left && link.right;
  const cue = cell ? cueOf(cell) : null;
  const footer = footerOf(cell);
  const marker = cell?.joined && cell.nodes.length > 0 ? "join" : cell?.ends && cell.nodes.length === 0 ? "stop" : null;

  return (
    <div className={`flex h-full flex-col ${cell?.chapterLabel ? "border-l border-[#5c564e]" : ""}`}>
      <div className="flex h-7 shrink-0 items-end justify-center px-2 pb-1">
        {cue ? (
          <p
            title={cue.text}
            className={`max-w-full truncate text-[11px] ${cue.tone === "pine" ? "font-medium tracking-[0.18em] text-[#2f5d54]" : "text-[#5c564e]"}`}
          >
            {cue.text}
          </p>
        ) : null}
      </div>
      <div className="flex min-h-16 flex-1 items-center">
        {through ? (
          <span className="h-0 w-full shrink-0 border-t border-dashed border-[#2f5d54]" />
        ) : occupied && cell ? (
          <>
            <Gutter show={link.left} marker={marker} />
            <div className="min-w-0 flex-1">
              {cell.nodes.length > 1 ? (
                <BranchStack
                  exit={link.right}
                  items={cell.nodes.map((node) => ({
                    key: node.id,
                    body: <NodeButton node={node} branch selected={openId === node.id} onOpen={onOpen} />,
                  }))}
                />
              ) : null}
              {cell.nodes.length === 1 ? <NodeButton node={cell.nodes[0]} selected={openId === cell.nodes[0].id} onOpen={onOpen} /> : null}
              {cell.ends ? (
                <div className={cell.nodes.length ? "mt-2" : ""}>
                  <BranchStack
                    exit={false}
                    items={cell.ends.labels.map((label) => ({
                      key: label,
                      body: (
                        <EndChip
                          label={label}
                          selected={openId === cell.ends?.beatId}
                          onClick={() => onOpen(openId === cell.ends?.beatId ? null : (cell.ends?.beatId ?? null))}
                        />
                      ),
                    }))}
                  />
                </div>
              ) : null}
            </div>
            <Gutter show={link.right} />
          </>
        ) : (
          <span className="w-full" />
        )}
      </div>
      <div className="flex h-8 shrink-0 items-start justify-center px-2 pt-1">
        {footer ? (
          <p title={footer} className="max-w-full truncate text-center text-[11px] leading-4 text-[#6b645b]">
            {footer}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Gutter({ show, marker }: { show: boolean; marker?: "join" | "stop" | null }) {
  return (
    <span aria-hidden className="flex w-5 shrink-0 items-center">
      {show ? <span className="h-px min-w-1 flex-1 bg-[#2f5d54]" /> : <span className="flex-1" />}
      {show && marker === "join" ? <span className="h-1.5 w-1.5 shrink-0 rotate-45 bg-[#2f5d54]" /> : null}
      {show && marker === "stop" ? <span className="h-1.5 w-1.5 shrink-0 bg-[#1c1915]" /> : null}
    </span>
  );
}

function BranchStack({ exit, items }: { exit: boolean; items: { key: string; body: ReactNode }[] }) {
  return (
    <div className="relative flex w-full flex-col gap-2">
      {!exit ? <span aria-hidden className="absolute right-0 top-1/2 z-10 h-1.5 w-1.5 -translate-y-1/2 bg-[#1c1915]" /> : null}
      {items.map((item, index) => (
        <div key={item.key} className={`relative ${exit ? "px-3" : "pl-3"}`}>
          <span aria-hidden className="absolute left-0 top-1/2 h-px w-3 -translate-y-1/2 bg-[#2f5d54]" />
          {index > 0 ? <span aria-hidden className="absolute -top-2 bottom-1/2 left-0 w-px bg-[#2f5d54]" /> : null}
          {index < items.length - 1 ? <span aria-hidden className="absolute -bottom-2 left-0 top-1/2 w-px bg-[#2f5d54]" /> : null}
          {exit ? (
            <>
              <span aria-hidden className="absolute right-0 top-1/2 h-px w-3 -translate-y-1/2 bg-[#2f5d54]" />
              {index > 0 ? <span aria-hidden className="absolute -top-2 right-0 bottom-1/2 w-px bg-[#2f5d54]" /> : null}
              {index < items.length - 1 ? <span aria-hidden className="absolute -bottom-2 right-0 top-1/2 w-px bg-[#2f5d54]" /> : null}
            </>
          ) : null}
          {item.body}
        </div>
      ))}
    </div>
  );
}

function NodeButton({
  node,
  branch,
  selected,
  onOpen,
}: {
  node: FlowNode;
  branch?: boolean;
  selected: boolean;
  onOpen: (id: string | null) => void;
}) {
  const primary = branch ? quoted(node.difference ?? node.gist) : node.gist;
  const secondary = branch ? node.flag : undefined;
  return (
    <button
      type="button"
      data-testid={`node-${node.id}`}
      aria-pressed={selected}
      aria-expanded={selected}
      title={secondary ? `${primary} ${secondary}` : primary}
      onClick={() => onOpen(selected ? null : node.id)}
      className={`relative z-10 flex h-[6.75rem] w-full flex-col justify-center rounded-xl border-2 px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f5d54] ${
        selected
          ? "border-[#1c1915] bg-[#1c1915] text-[#f7f4ee]"
          : "border-[#cfc6b8] bg-[#f7f4ee] text-[#1c1915] hover:border-[#1c1915] hover:bg-[#fbf9f5]"
      }`}
    >
      <span className="line-clamp-3 text-sm font-medium leading-5">{primary}</span>
      {secondary ? <span className={`mt-1 line-clamp-2 text-[11px] leading-4 ${selected ? "text-[#cfc6b8]" : "text-[#2f5d54]"}`}>{secondary}</span> : null}
    </button>
  );
}

function quoted(text: string): string {
  return text.includes("「") ? text : `「${text}」`;
}

function EndChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`relative z-10 flex h-12 w-full items-center rounded-lg border-2 px-3 text-left text-[13px] leading-snug focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f5d54] ${
        selected ? "border-[#1c1915] bg-[#efeae2] text-[#1c1915]" : "border-[#cfc6b8] bg-[#f7f4ee] text-[#1c1915] hover:border-[#1c1915] hover:bg-[#fbf9f5]"
      }`}
    >
      {label}
    </button>
  );
}

export function sequenceBoard(script: Script): SequenceBoard {
  const ranks = sequenceRank(script.beats);
  const chapters = storyFlow(script);
  let columns = Math.max(0, ...ranks.values()) + 1;
  const lanes = chapters.map((chapter) => {
    const cells: Array<SequenceCell | null> = [];
    const ensure = (index: number) => {
      while (cells.length <= index) cells.push(null);
      columns = Math.max(columns, index + 1);
    };
    const fill = (index: number) => {
      ensure(index);
      if (!cells[index]) cells[index] = { nodes: [] };
      return cells[index] as SequenceCell;
    };
    let pendingJoin = false;
    for (const row of chapter.rows) {
      if (row.type === "note") {
        const last = [...cells].reverse().find((cell) => cell && cell.nodes.length > 0);
        if (last) last.note = row.text;
        continue;
      }
      if (row.type === "join") {
        pendingJoin = true;
        continue;
      }
      if (row.type === "ends") {
        const cell = fill((ranks.get(row.beatId) ?? 0) + 1);
        cell.ends = { beatId: row.beatId, title: row.title, labels: row.labels };
        continue;
      }
      if (row.type === "node") {
        const cell = fill(ranks.get(row.node.id) ?? 0);
        cell.nodes = [row.node];
        cell.joined = pendingJoin;
        markChapter(cell, row.node.chapter, script, cells);
        pendingJoin = false;
        continue;
      }
      const cell = fill(ranks.get(row.nodes[0].id) ?? 0);
      cell.nodes = row.nodes;
      cell.forkTitle = row.title;
      cell.joined = pendingJoin;
      markChapter(cell, row.nodes[0]?.chapter, script, cells);
      pendingJoin = false;
    }
    while (cells.length < columns) cells.push(null);
    return { channel: chapter.channel, title: chapter.title, cells };
  });
  for (const lane of lanes) {
    while (lane.cells.length < columns) lane.cells.push(null);
  }
  return {
    columns,
    lanes,
    columnOf: (id: string) => ranks.get(id) ?? -1,
  };
}

function markChapter(cell: SequenceCell, chapter: number | undefined, script: Script, cells: Array<SequenceCell | null>) {
  if (!chapter || chapter <= 1 || cell.chapterLabel) return;
  const already = cells.some((item) => item?.chapterLabel || item?.nodes.some((node) => node.chapter === chapter && item !== cell));
  if (already) return;
  cell.chapterLabel = script.chapters?.find((item) => item.index === chapter)?.title ?? `第${chapter}章`;
}

function sequenceRank(beats: Beat[]): Map<string, number> {
  const rank = new Map(beats.map((beat) => [beat.id, 0]));
  const bump = (id: string, value: number) => {
    if (!rank.has(id)) return;
    rank.set(id, Math.max(rank.get(id) ?? 0, value));
  };
  for (let pass = 0; pass < beats.length; pass += 1) {
    for (const beat of beats) {
      const source = rank.get(beat.id) ?? 0;
      if (beat.next) bump(beat.next, source + 1);
      for (const choice of beat.choices ?? []) {
        if (choice.next) bump(choice.next, source + 1);
      }
      for (const required of beat.requires ?? []) bump(beat.id, (rank.get(required) ?? 0) + 1);
    }
  }
  const used = [...new Set(rank.values())].sort((a, b) => a - b);
  const dense = new Map(used.map((value, index) => [value, index]));
  return new Map([...rank.entries()].map(([id, value]) => [id, dense.get(value) ?? 0]));
}

export function storyFlow(script: Script): FlowChapter[] {
  const channels: Channel[] = ["left", "right"];
  return channels
    .map((channel) => {
      const beats = script.beats.filter((beat) => beat.channel === channel);
      const speaker = script.speakers.find((item) => item.channel === channel);
      return {
        channel,
        title: speaker?.name ?? channel,
        rows: chapterRows(beats),
      };
    })
    .filter((chapter) => chapter.rows.length > 0);
}

function chapterRows(beats: Beat[]): FlowRow[] {
  const ids = new Set(beats.map((beat) => beat.id));
  const rows: FlowRow[] = [];
  for (const group of cluster(beats)) {
    if (group.length === 1 && !group[0].when) {
      const beat = group[0];
      rows.push({ type: "node", node: { id: beat.id, gist: gistOf(beat), chapter: beat.chapter } });
      const follow = followRow(beat);
      if (follow) rows.push(follow);
      continue;
    }

    const outside = (group[0].requires ?? []).filter((id) => !ids.has(id));
    const flagName = flagKey(group[0]);
    const wait = outside.length ? `要等 ${outside.join("、")}` : "";
    rows.push({
      type: "fork",
      title: ["按 " + flagName + " 分开", wait].filter(Boolean).join(" · "),
      nodes: group.map((beat) => ({
        id: beat.id,
        gist: gistOf(beat),
        difference: differenceOf(beat, group),
        flag: beat.when ? flagLabel(beat.when) : undefined,
        chapter: beat.chapter,
      })),
    });
    const nexts = [...new Set(group.map((beat) => beat.next).filter((id): id is string => Boolean(id)))];
    if (nexts.length === 1) rows.push({ type: "join" });
    const shared = sharedEndNote(group);
    if (shared) rows.push({ type: "ends", beatId: group[0].id, title: "这几路的选项一样，都先停", labels: shared });
  }
  return rows;
}

function followRow(beat: Beat): FlowRow | null {
  const choices = beat.choices ?? [];
  if (choices.length < 2) return null;
  const nexts = new Set(choices.map((choice) => choice.next ?? ""));
  if (nexts.size === 1 && [...nexts][0]) {
    const keys = [...new Set(choices.flatMap((choice) => Object.keys(choice.set ?? {})))];
    const remembered = keys.length ? `记下 ${keys.join("、")}，` : "";
    return { type: "note", text: `${choices.length} 个选择${remembered}都到 ${[...nexts][0]}` };
  }
  if ([...nexts].every((next) => next === "")) {
    return { type: "ends", beatId: beat.id, title: "在这里分开，然后停下", labels: choices.map((choice) => endLabel(choice)) };
  }
  return null;
}

function sharedEndNote(group: Beat[]): string[] | null {
  if (group.length < 2) return null;
  const signature = endingSignature(group[0]);
  if (!group.every((beat) => endingSignature(beat) === signature)) return null;
  const choices = group[0].choices ?? [];
  if (!choices.length || choices.some((choice) => choice.next)) return null;
  return choices.map((choice) => choice.thought);
}

function endLabel(choice: Choice): string {
  if (choice.set) return `${choice.thought} · ${flagLabel(choice.set)}`;
  return `${choice.thought} · 先停`;
}

function endingSignature(beat: Beat): string {
  return (beat.choices ?? []).map((choice) => `${choice.thought}|${choice.next ?? ""}|${JSON.stringify(choice.set ?? null)}`).join("||");
}

function cluster(beats: Beat[]): Beat[][] {
  const groups: Beat[][] = [];
  let index = 0;
  while (index < beats.length) {
    const beat = beats[index];
    if (!beat.when) {
      groups.push([beat]);
      index += 1;
      continue;
    }
    const key = requiresKey(beat);
    const group = [beat];
    let next = index + 1;
    while (next < beats.length && beats[next].when && requiresKey(beats[next]) === key) {
      group.push(beats[next]);
      next += 1;
    }
    groups.push(group);
    index = next;
  }
  return groups;
}

function differenceOf(beat: Beat, siblings: Beat[]): string {
  const own = uniqueClause(beat, siblings);
  if (own) return own;
  const theirs = siblings
    .filter((item) => item.id !== beat.id)
    .map((item) => uniqueClause(item, siblings))
    .filter((clause): clause is string => Boolean(clause));
  const prefix = longestCommonPrefix(theirs);
  const snippet = prefix.slice(0, Math.min(5, prefix.length));
  if (snippet.length >= 2 && !humanLines(beat).join("").includes(snippet)) return `没说「${snippet}」`;
  return "没有另外几路多出来的那句";
}

function uniqueClause(beat: Beat, siblings: Beat[]): string | null {
  const mine = humanLines(beat);
  const last = mine[mine.length - 1] ?? "";
  const others = new Set(
    siblings
      .filter((item) => item.id !== beat.id)
      .flatMap((item) => humanLines(item).flatMap(splitClauses)),
  );
  const unique = mine.flatMap(splitClauses).filter((clause) => !others.has(clause));
  const inLast = unique.filter((clause) => last.includes(clause));
  const pool = (inLast.length ? inLast : unique).filter((clause) => clause.length >= 4);
  if (!pool.length) return null;
  return [...pool].sort((a, b) => a.length - b.length)[0];
}

function longestCommonPrefix(texts: string[]): string {
  if (!texts.length) return "";
  let prefix = texts[0];
  for (const text of texts.slice(1)) {
    let index = 0;
    while (index < prefix.length && index < text.length && prefix[index] === text[index]) index += 1;
    prefix = prefix.slice(0, index);
  }
  return prefix;
}

function gistOf(beat: Beat): string {
  const line = humanLines(beat)[0];
  if (!line) return beat.id;
  return line.length > 18 ? `${line.slice(0, 18)}…` : line;
}

function humanLines(beat: Beat): string[] {
  return beat.lines
    .filter((line) => line.from !== "ai" && line.delivery !== "thought")
    .map((line) => line.text.replace(/\s+/g, " ").trim());
}

function splitClauses(text: string): string[] {
  return text
    .split(/[，。！？]/)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length >= 2);
}

function flagKey(beat: Beat): string {
  return Object.keys(beat.when ?? {}).join("、");
}

function flagLabel(flags: Record<string, Scalar>): string {
  return Object.entries(flags)
    .map(([key, value]) => `${key} = ${String(value)}`)
    .join("，");
}

function requiresKey(beat: Beat): string {
  return (beat.requires ?? []).join("|");
}

function BeatCard({ script, beat, onClose }: { script: Script; beat: Beat; onClose: () => void }) {
  const stopped = !beat.next && !(beat.choices ?? []).some((choice) => choice.next);
  const ref = useRef<HTMLElement>(null);
  const condition = [beat.requires?.length ? requiresLabel(beat.requires) : "", beat.when ? whenLabel(beat.when) : ""].filter(Boolean).join(" · ");

  useEffect(() => {
    ref.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, []);

  return (
    <article ref={ref} id={`beat-${beat.id}`} data-testid={`beat-${beat.id}`} className="max-w-3xl scroll-mt-6 rounded-2xl border border-[#cfc6b8] bg-[#f7f4ee]">
      <header className="flex items-start justify-between gap-3 border-b border-[#cfc6b8] px-5 py-4">
        <div className="min-w-0">
          <p className="text-[11px] tracking-[0.16em] text-[#6b645b]">
            {beat.channel === "left" ? "男生" : "女生"}
            {stopped ? " · 说完先停" : ""}
          </p>
          <h2 className="mt-1 text-lg font-medium">{beat.id}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-full border border-[#cfc6b8] px-3 py-1.5 text-xs text-[#1c1915] hover:border-[#1c1915] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f5d54]"
        >
          收起
        </button>
      </header>
      <div className="flex flex-col gap-5 px-5 py-5 text-sm leading-relaxed">
        {condition ? <p className="text-[#5c564e]">{condition}</p> : null}
        {beat.aside ? (
          <div className="border-l border-[#2f5d54] bg-[#efeae2] px-4 py-3">
            <p className="text-[11px] tracking-[0.14em] text-[#6b645b]">自言自语，不发进聊天</p>
            <p className="mt-2 whitespace-pre-wrap leading-7 text-[#3e4a45]">{beat.aside}</p>
          </div>
        ) : null}
        <div className="flex flex-col gap-4">
          {beat.lines.map((line, index) => (
            <LineBlock key={index} script={script} line={line} />
          ))}
        </div>
        {beat.choices?.length ? (
          <div className="flex flex-col gap-3">
            {beat.choices.map((choice, index) => (
              <ChoiceBlock key={index} choice={choice} />
            ))}
          </div>
        ) : null}
        {beat.next ? <p className="text-xs text-[#2f5d54]">台词播完到 {beat.next}</p> : null}
      </div>
    </article>
  );
}

function LineBlock({ script, line }: { script: Script; line: Line }) {
  const thought = line.delivery === "thought";
  return (
    <div className={line.from === "ai" ? "pl-4" : ""}>
      <p className="text-[11px] tracking-[0.12em] text-[#6b645b]">
        {nameOf(script, line.from)} · {deliveryLabel[line.delivery]}
      </p>
      {line.delivery === "image" ? (
        <p className="mt-1 leading-7 text-[#3e4a45]">
          图片 {line.text}
          {line.caption ? `，${line.caption}` : ""}
        </p>
      ) : (
        <p className={`mt-1 whitespace-pre-wrap leading-7 ${thought ? "border-l border-[#2f5d54] pl-3 text-[#3e4a45]" : "text-[#1c1915]"}`}>{line.text}</p>
      )}
    </div>
  );
}

function ChoiceBlock({ choice }: { choice: Choice }) {
  return (
    <div className="rounded-xl border border-[#cfc6b8] bg-[#fbf9f5] px-4 py-3">
      <p className="text-[11px] tracking-[0.14em] text-[#6b645b]">想法</p>
      <p className="mt-1 leading-relaxed">{choice.thought}</p>
      <p className="mt-3 text-[11px] tracking-[0.14em] text-[#6b645b]">发出去的回复</p>
      <p className="mt-1 whitespace-pre-wrap leading-7 text-[#1c1915]">{choice.reply}</p>
      {choice.set ? <p className="mt-3 text-xs text-[#2f5d54]">记下 {formatFlags(choice.set)}</p> : null}
      <p className="mt-1 text-xs text-[#6b645b]">{choice.next ? `选完到 ${choice.next}` : "选完先停"}</p>
    </div>
  );
}

function requiresLabel(ids: string[]): string {
  if (ids.length === 1) return `要等 ${ids[0]} 完成`;
  return `要等 ${ids.join("、")} 都完成`;
}

function whenLabel(when: Record<string, Scalar>): string {
  return `只有 ${flagLabel(when)} 才出现`;
}

function formatFlags(flags: Record<string, Scalar>): string {
  return flagLabel(flags);
}
