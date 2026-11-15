import blipUrl from "./character-blip.wav";

let context: AudioContext | undefined;
let master: GainNode | undefined;
let blip: Promise<AudioBuffer | undefined> | undefined;
const setting = "shuangxian.sound-muted";

export function soundMuted() {
  try { return localStorage.getItem(setting) === "true"; } catch { return false; }
}

export function setSoundMuted(muted: boolean) {
  try { localStorage.setItem(setting, String(muted)); } catch { /* storage unavailable */ }
  if (master) master.gain.value = muted ? 0 : 1;
  if (!muted) unlockSound();
}

export function unlockSound() {
  if (typeof AudioContext === "undefined") return;
  try {
    if (!context) {
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = soundMuted() ? 0 : 1;
      master.connect(context.destination);
    }
    const audio = context;
    void audio.resume().catch(() => {});
    blip ??= fetch(blipUrl).then(response => {
      if (!response.ok) throw Error("Could not load the character sound");
      return response.arrayBuffer();
    }).then(bytes => audio.decodeAudioData(bytes)).catch(() => undefined);
  } catch { /* audio is optional if unavailable */ }
}

export function replyPulses(duration: number) {
  const base = Math.round(75 + 15 * Math.max(0, Math.min(1, (duration - 1000) / 5000)));
  let seed = (Math.round(duration) * 2654435761) >>> 0;
  const rng = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const targets: number[] = [];
  for (let tries = 0; targets.length < Math.floor(duration / 1400) && tries < 100; tries++) {
    const at = 200 + rng() * Math.max(0, duration - 550);
    if (targets.every(other => Math.abs(at - other) > 250)) targets.push(at);
  }
  targets.sort((a, b) => a - b);
  const pulses: { at: number; level: number }[] = [];
  let at = 0;
  while (at + 40 <= duration) {
    const fade = Math.max(0, Math.min(1, (at - 1000) / 1500));
    pulses.push({ at, level: 1 - 0.6 * fade });
    at += base + Math.floor(rng() * 13) - 6;
    if (targets.length && at >= targets[0]) {
      targets.shift();
      at += 75 + Math.floor(rng() * 76);
    }
  }
  return pulses;
}

export function playReplySound(duration: number) {
  const audio = context;
  if (!audio || !master || !blip || audio.state !== "running" || duration < 40) return;
  const output = audio.createGain();
  const start = audio.currentTime + 0.012;
  const sources: AudioBufferSourceNode[] = [];
  let stopped = false;
  output.connect(master);
  void blip.then(buffer => {
    if (!buffer || stopped) return;
    for (const { at, level } of replyPulses(duration)) {
      const time = start + at / 1000;
      if (time < audio.currentTime) continue;
      const source = audio.createBufferSource();
      source.buffer = buffer;
      const gain = audio.createGain();
      gain.gain.value = 0.12 * level;
      source.connect(gain);
      gain.connect(output);
      source.start(time);
      sources.push(source);
    }
  });
  return () => {
    stopped = true;
    output.disconnect();
    for (const source of sources) source.stop();
  };
}

export function playMemorySound() {
  const audio = context;
  if (!audio || !master || audio.state !== "running") return;
  const start = audio.currentTime + 0.012;
  for (const [offset, freq, length, level] of [[0, 390, 0.09, 0.17], [0.095, 585, 0.17, 0.21]]) {
    const at = start + offset;
    const tone = audio.createOscillator();
    const envelope = audio.createGain();
    tone.type = "triangle";
    tone.frequency.value = freq;
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(level, at + 0.005);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + length);
    tone.connect(envelope);
    envelope.connect(master);
    tone.start(at);
    tone.stop(at + length + 0.006);
  }
}
