import { useEffect, useRef, useState } from "react";
import type { Delivery } from "../engine/types";
import { TYPE_INTERVAL_MS } from "../presentation";

/** 记忆候选高亮：候选原文片段；saved=已存（不再可点）。 */
export type MemoryMark = { text: string; saved: boolean };

type Props = {
  from: string;
  speakerName: string;
  text: string;
  delivery: Delivery;
  caption?: string;
  animate: boolean;
  marks?: MemoryMark[];
  /** 气泡上打的便签（如「记忆可用」）；缺省不打。 */
  note?: string | null;
  onSaveMark?: (text: string) => void;
  onFinished?: () => void;
  onProgress?: () => void;
};

export function MessageBubble({
  from,
  speakerName,
  text,
  delivery,
  caption,
  animate,
  marks,
  note,
  onSaveMark,
  onFinished,
  onProgress,
}: Props) {
  const typing = animate && delivery === "type";
  const [shown, setShown] = useState(() => (typing ? Math.min(1, text.length) : text.length));
  const finished = useRef(false);
  const onFinishedRef = useRef(onFinished);
  const onProgressRef = useRef(onProgress);
  onFinishedRef.current = onFinished;
  onProgressRef.current = onProgress;
  const mine = from === "ai";

  useEffect(() => {
    if (!typing) return;
    if (shown >= text.length) {
      if (!finished.current) {
        finished.current = true;
        onFinishedRef.current?.();
      }
      return;
    }
    const timer = window.setTimeout(() => {
      setShown((count) => count + 1);
      onProgressRef.current?.();
    }, TYPE_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [shown, text, typing]);

  const visible = typing ? text.slice(0, shown) : text;

  const renderWithMarks = (value: string) => {
    if (!marks || marks.length === 0) return value;
    const found = marks
      .map((mark) => ({ mark, at: value.indexOf(mark.text) }))
      .filter((item) => item.at >= 0)
      .sort((a, b) => a.at - b.at);
    if (found.length === 0) return value;
    const nodes = [];
    let cursor = 0;
    for (const { mark, at } of found) {
      if (at < cursor) continue;
      if (at > cursor) nodes.push(value.slice(cursor, at));
      nodes.push(
        <span
          key={`${at}-${mark.text}`}
          data-testid="memory-mark"
          data-saved={mark.saved}
          role={mark.saved ? undefined : "button"}
          tabIndex={mark.saved ? -1 : 0}
          className={mark.saved ? "memory-mark memory-mark-saved" : "memory-mark"}
          onClick={mark.saved || !onSaveMark ? undefined : () => onSaveMark(mark.text)}
        >
          {mark.text}
        </span>,
      );
      cursor = at + mark.text.length;
    }
    if (cursor < value.length) nodes.push(value.slice(cursor));
    return nodes;
  };

  if (delivery === "thought") {
    return (
      <div className="flex max-w-[92%] flex-col gap-1 self-stretch" data-from={from} data-delivery="thought">
        <span className="text-[11px] tracking-[0.14em] text-[#6b645b]">自言自语</span>
        <div data-testid="bubble-text" className="border-l-2 border-[#2f5d54] pl-3 text-sm leading-relaxed text-[#3e4a45]">
          {visible}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative flex max-w-[85%] flex-col gap-1 ${mine ? "items-end self-end" : "items-start self-start"}`}
      data-from={from}
      data-delivery={delivery}
    >
      {note ? (
        <span
          data-testid="memory-note"
          className="absolute -top-3 right-2 z-10 rotate-3 rounded-[3px] border border-[#d9b64a] bg-[#f6e3a8] px-2 py-0.5 text-[11px] leading-tight text-[#6b5a1e] shadow-[0_1px_2px_rgba(40,30,10,0.15)]"
        >
          {note}
        </span>
      ) : null}
      <span className="px-1 text-[11px] text-[#6b645b]">{speakerName}</span>
      {delivery === "image" ? (
        <figure className="bubble-in overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(40,30,10,0.06)]">
          <img src={text} alt={caption ?? "图片"} className="max-h-64 max-w-full object-cover" />
          {caption ? <figcaption className="px-3 py-2 text-xs text-[#5c564e]">{caption}</figcaption> : null}
        </figure>
      ) : (
        <div
          data-testid="bubble-text"
          className={`bubble-in whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed ${
            mine
              ? "rounded-br-md bg-[#24312e] text-[#f6f3ec]"
              : "rounded-bl-md bg-white text-[#1c1915] shadow-[0_1px_2px_rgba(40,30,10,0.05)]"
          }`}
        >
          {renderWithMarks(visible)}
        </div>
      )}
    </div>
  );
}
