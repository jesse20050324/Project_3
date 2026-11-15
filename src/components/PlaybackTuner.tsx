import { useState } from "react";
import { useLanguage } from "../language";
import { PLAYBACK_SPEEDS } from "../presentation";
import "./PlaybackTuner.css";

const controls = [
  ["incoming", "来信逐字", "Incoming text"],
  ["reply", "AI 回复逐字", "AI reply text"],
  ["thought", "Thinking 逐字", "Thinking text"],
  ["indicator", "接收／发送／思考提示", "Receiving / sending / thinking indicator"],
  ["after", "消息播完后的停留", "Hold after a message"],
  ["sameTime", "同一时间小段内的留白", "Gap within the same time block"],
  ["timeJump", "跨时间虚线的留白", "Gap across a time divider"],
] as const;

type Control = typeof controls[number][0];
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
      {controls.map(([key, zh, en]) => {
        const value = speeds[key] ?? PLAYBACK_SPEEDS[key];
        return <label key={key}>
          <span>{t(zh, en)}</span><span className="playback-tuner-value">{value.toFixed(2)}×</span>
          <input type="range" min="0.25" max="4" step="0.05" value={value} aria-label={t(zh, en)}
            aria-valuetext={`${value.toFixed(2)}×`} onChange={event =>
              onChange({ ...speeds, [key]: event.currentTarget.valueAsNumber })} />
        </label>;
      })}
      <button type="button" onClick={() => onChange({})}>[{t("恢复默认", "Reset to Defaults")}]</button>
    </section>}
  </div>;
}
