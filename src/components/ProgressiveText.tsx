import { useEffect, useRef, useState } from "react";

export function useProgressiveText(text: string, typing: boolean, interval: number, onFinished?: () => void, onProgress?: () => void) {
  const [shown, setShown] = useState(() => typing ? Math.min(1, text.length) : text.length);
  const finished = useRef(false);
  const done = useRef(onFinished);
  const progress = useRef(onProgress);
  done.current = onFinished;
  progress.current = onProgress;
  useEffect(() => {
    if (!typing) return;
    if (shown >= text.length) {
      if (!finished.current) {
        finished.current = true;
        done.current?.();
      }
      return;
    }
    const timer = window.setTimeout(() => {
      setShown(count => count + 1);
      progress.current?.();
    }, Math.max(0, interval));
    return () => window.clearTimeout(timer);
  }, [shown, text, typing, interval]);
  return typing ? text.slice(0, shown) : text;
}

export function ProgressiveText({ text, interval, onFinished }: {
  text: string; interval: number; onFinished: () => void;
}) {
  const visible = useProgressiveText(text, true, interval, onFinished);
  return <>{visible}{visible.length < text.length ? <span className="caret" aria-hidden="true" /> : null}</>;
}
