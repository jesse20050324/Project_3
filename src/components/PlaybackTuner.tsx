import { useState } from "react";
import { useLanguage } from "../language";
import { PLAYBACK_GAPS, PLAYBACK_SPEEDS } from "../presentation";
import "./PlaybackTuner.css";

const controls = [
  ["incoming", "来信逐字", "Incoming text"],
  ["reply", "AI 回复逐字", "AI reply text"],
  ["thought", "Thinking 逐字", "Thinking text"],
  ["indicator", "接收／发送／思考提示", "Receiving / sending / thinking indicator"],
] as const;

const gaps = [
  ["messageGap", "普通消息间隔", "Message gap"],
  ["beforeDivider", "虚线前 · 末字到出线", "Before divider · last character to line"],
  ["afterDivider", "虚线后 · 出线到首字", "After divider · line to first character"],
] as const;
const defaults = { ...PLAYBACK_SPEEDS, ...PLAYBACK_GAPS };
type Control = keyof typeof defaults;
export type PlaybackSpeeds = Partial<Record<Control, number>>;

export default function PlaybackTuner({ speeds, onChange }: {
  speeds: PlaybackSpeeds;
  onChange: (speeds: PlaybackSpeeds) => void;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);

  return <div className="playback-tuner" onKeyDown={event => {
    if (event.key === "Escape" && open) {
      setOpen(false);
      event.currentTarget.querySelector("button")?.focus();
    }
  }}>
    <button type="button" aria-controls="playback-tuner-controls" aria-expanded={open}
      onClick={() => setOpen(value => !value)}>[{t("节奏调试", "Tune Playback")}]</button>
    {open && <section id="playback-tuner-controls" className="playback-tuner-controls"
      aria-label={t("节奏调试", "Tune Playback")}>
      <p>{t("倍率越高越快。逐字速度即时生效，已开始的停顿播完后再应用新值。",
        "Higher is faster. Text updates live. Any wait already in progress finishes first.")}</p>
      {[...controls, ...gaps].map(([key, zh, en]) => {
        const seconds = key in PLAYBACK_GAPS;
        const value = speeds[key] ?? defaults[key];
        const display = value.toFixed(2) + (seconds ? t(" 秒", " s") : "×");
        return <label key={key}>
          <span>{t(zh, en)}</span><span className="playback-tuner-value">{display}</span>
          <input type="range" min={seconds ? 0 : 0.25} max={seconds ? 8 : 4} step="0.05" value={value} aria-label={t(zh, en)}
            aria-valuetext={display} onChange={event =>
              onChange({ ...speeds, [key]: event.currentTarget.valueAsNumber })} />
        </label>;
      })}
      <button type="button" onClick={() => onChange({})}>[{t("恢复默认", "Reset to Defaults")}]</button>
    </section>}
  </div>;
}
