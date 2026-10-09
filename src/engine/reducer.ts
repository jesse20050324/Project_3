import type { Beat, Channel, EngineState } from "./types";
import { choose, commitLine, commitReply, createInitial, openChannel } from "./scheduler";

export type Action =
  | { type: "reset" }
  | { type: "arm"; channel: Channel }
  | { type: "commit-line"; channel: Channel }
  | { type: "choose"; channel: Channel; index: number }
  | { type: "commit-reply"; channel: Channel };

export function createReducer(beats: Beat[]) {
  return (state: EngineState, action: Action): EngineState => {
    try {
      switch (action.type) {
        case "reset":
          return createInitial(beats);
        case "arm":
          return openChannel(state, action.channel, beats);
        case "commit-line":
          return commitLine(state, action.channel, beats);
        case "choose":
          return choose(state, action.channel, action.index, beats);
        case "commit-reply":
          return commitReply(state, action.channel, beats);
        default:
          return state;
      }
    } catch (error) {
      console.error(error);
      return state;
    }
  };
}
