import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Delivery } from "../engine/types";

/** 记忆候选高亮：候选原文片段；saved=已存（不再可点）。 */
export type MemoryMark = { text: string; saved: boolean };

type Props = {
  from: string;
  text: string;
  delivery: Delivery;
  caption?: string;
  animate?: boolean;
  /** 本句的逐字间隔，来自 ChatMessage.timing，可逐条不同。 */
  typeIntervalMs?: number;
  marks?: MemoryMark[];
  onSaveMark?: (text: string) => void;
  onFinished?: () => void;
  onProgress?: () => void;
  onSkip?: () => void;
};

/**
 * 参考稿第一原则：玩家是 AI。
 * 对面（用户）消息靠左、浅灰气泡；AI 消息靠右、纯文字，无头像无名字无气泡。
 * thought 不在消息流里渲染，由 ChatPane 放进输入卡上方的思考块。
 */
export function MessageBubble({
  from,
  text,
  delivery,
  caption,
  animate = false,
  typeIntervalMs = 100,
  marks,
  onSaveMark,
  onFinished,
  onProgress,
  onSkip,
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
    }, Math.max(0, typeIntervalMs));
    return () => window.clearTimeout(timer);
  }, [shown, text, typing, typeIntervalMs]);

  if (delivery === "thought") return null;

  const visible = typing ? text.slice(0, shown) : text;
  const renderWithMarks = (value: string) => {
    if (!marks || marks.length === 0) return value;
    const found = marks
      .map((mark) => ({ mark, at: value.indexOf(mark.text) }))
      .filter((item) => item.at >= 0)
      .sort((a, b) => a.at - b.at);
    if (found.length === 0) return value;
    const nodes: ReactNode[] = [];
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

  if (delivery === "image") {
    return (
      <div className={`msg-row ${mine ? "right" : "left"}`} data-from={from} data-delivery={delivery}>
        <figure className="msg-image">
          <img src={text} alt={caption ?? "图片"} />
          {caption ? <figcaption>{caption}</figcaption> : null}
        </figure>
      </div>
    );
  }

  return (
    <div className={`msg-row ${mine ? "right" : "left"}`} data-from={from} data-delivery={delivery}>
      <div
        className={mine ? "msg-ai" : "msg-user"}
        data-testid="bubble-text"
        onClick={typing ? onSkip : undefined}
        title={typing ? "点击跳过" : undefined}
      >
        {renderWithMarks(visible)}
        {typing && shown < text.length ? <span className="caret" aria-hidden="true" /> : null}
      </div>
    </div>
  );
}
