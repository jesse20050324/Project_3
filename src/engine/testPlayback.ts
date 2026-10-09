import { commitLine, commitReply, openChannel } from "./scheduler";
import type { Beat, Channel, EngineState } from "./types";

export function drain(state: EngineState, channel: Channel, beats: Beat[]): EngineState {
  let current = openChannel(state, channel, beats);
  for (let step = 0; step < 40; step += 1) {
    const pending = current.pending[channel];
    if (!pending || pending.kind === "choices") return current;
    current = pending.kind === "reply" ? commitReply(current, channel, beats) : commitLine(current, channel, beats);
    if (!current.pending[channel]) {
      const opened = openChannel(current, channel, beats);
      if (opened === current) return current;
      current = opened;
    }
  }
  throw new Error("步数过多，可能有环");
}
