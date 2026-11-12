import type { ReactNode } from "react";
import { useProgressiveText } from "./ProgressiveText";
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
  const mine = from === "ai";
  const visible = useProgressiveText(text, typing, typeIntervalMs, onFinished, onProgress);

  if (delivery === "thought") return null;
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
        mark.saved ? (
          <span key={`${at}-${mark.text}`} data-testid="memory-mark" data-saved="true" className="memory-mark-saved">
            {mark.text}<span className="memory-tag"> [MEM] 已存</span>
          </span>
        ) : (
          <button key={`${at}-${mark.text}`} type="button" data-testid="memory-mark" data-saved="false"
            className="memory-mark" disabled={!onSaveMark} aria-label={`存记忆：${mark.text}`} onClick={() => onSaveMark?.(mark.text)}>
            {mark.text} [+]
          </button>
        ),
      );
      cursor = at + mark.text.length;
    }
    if (cursor < value.length) nodes.push(value.slice(cursor));
    return nodes;
  };

  if (delivery === "image") {
    return (
      <div className={`msg-row ${mine ? "right" : "left"}`} data-from={from} data-delivery={delivery}>
        <span className="msg-direction" aria-hidden="true">{mine ? "OUT<" : "IN>"}</span>
        <figure className="msg-image">
          <img src={text} alt={caption ?? "图片"} />
          {caption ? <figcaption>{caption}</figcaption> : null}
        </figure>
      </div>
    );
  }

  return (
    <div className={`msg-row ${mine ? "right" : "left"}`} data-from={from} data-delivery={delivery}>
      <span className="msg-direction" aria-hidden="true">{mine ? "OUT<" : "IN>"}</span>
      <div
        className={mine ? "msg-ai" : "msg-user"}
        data-testid="bubble-text"
        onClick={typing ? onSkip : undefined}
        title={typing ? "点击跳过" : undefined}
      >
        {mine ? <span className="msg-ink">{renderWithMarks(visible)}</span> : renderWithMarks(visible)}
        {typing && visible.length < text.length ? <span className="caret" aria-hidden="true" /> : null}
      </div>
    </div>
  );
}
