import { useEffect, useRef, useState } from "react";
import type { Delivery } from "../engine/types";
import { TYPE_INTERVAL_MS } from "../presentation";

type Props = {
  from: string;
  speakerName: string;
  text: string;
  delivery: Delivery;
  caption?: string;
  animate: boolean;
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

  return (
    <div className={`flex max-w-[85%] flex-col gap-1 ${mine ? "items-end self-end" : "items-start self-start"}`} data-from={from} data-delivery={delivery}>
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
          {visible}
        </div>
      )}
    </div>
  );
}
