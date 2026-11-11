import type { Beat, Channel, EngineState } from "./types";
import {
  choose, clearChannelMessages, commitLine, commitReply, createInitial,
  detectWindowViolation, forgetMemory, openChannel, ritualTick, saveMemory, withMissingRoots,
} from "./scheduler";

export type Action =
  | { type: "reset" }
  | { type: "sync-roots" }
  | { type: "arm"; channel: Channel; now?: number }
  | { type: "commit-line"; channel: Channel }
  | { type: "choose"; channel: Channel; index: number }
  | { type: "commit-reply"; channel: Channel }
  | { type: "save-memory"; channel: Channel; label: string; text: string; beatId: string; replaceLabel?: string }
  | { type: "forget-memory"; channel: Channel; label: string }
  | { type: "clear-messages"; channel: Channel }
  | { type: "ritual-tick"; channel: Channel; now: number }
  | { type: "clear-error" };

export function createReducer(beats: Beat[]) {
  /**
   * 每次状态变化都重新检查区间门；异常写进 state.error，不再静默吞掉。
   * 关键：无变化时返回原对象，否则 useEngine 的开演 effect 会被新引用反复触发（死循环）。
   */
  const settle = (state: EngineState): EngineState => {
    const violation = detectWindowViolation(state, beats);
    return violation === state.error ? state : { ...state, error: violation };
  };

  return (state: EngineState, action: Action): EngineState => {
    try {
      switch (action.type) {
        case "reset":
          return { ...createInitial(beats), runId: state.runId + 1 };
        case "sync-roots":
          return settle(withMissingRoots(state, beats));
        case "arm":
          return settle(openChannel(state, action.channel, beats, action.now ?? Date.now()));
        case "commit-line":
          return settle(commitLine(state, action.channel, beats));
        case "choose":
          return settle(choose(state, action.channel, action.index, beats));
        case "commit-reply":
          return settle(commitReply(state, action.channel, beats));
        case "save-memory": {
          const beat = beats.find(item => item.id === action.beatId && item.channel === action.channel);
          const candidate = beat?.记忆候选?.find(item => item.缩略标签 === action.label && item.短句 === action.text);
          if (!candidate || !state.messages.some(message => message.channel === action.channel
            && message.beatId === action.beatId && message.text.includes(action.text))) return state;
          return settle(saveMemory(state, action.channel, {
            label: action.label,
            text: action.text,
            beatId: action.beatId,
          }, action.replaceLabel));
        }
        case "forget-memory":
          return settle(forgetMemory(state, action.channel, action.label));
        case "clear-messages":
          return settle(clearChannelMessages(state, action.channel));
        case "ritual-tick":
          return settle(ritualTick(state, action.channel, action.now));
        case "clear-error":
          return { ...state, error: null };
        default:
          return state;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "引擎状态更新失败";
      console.error("[引擎]", message);
      return { ...state, error: message };
    }
  };
}
