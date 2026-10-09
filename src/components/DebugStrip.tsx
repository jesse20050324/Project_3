import { describeChannel, formatFlags } from "../engine/scheduler";
import type { EngineState, Script } from "../engine/types";

type Props = {
  script: Script;
  state: EngineState;
};

export function DebugStrip({ script, state }: Props) {
  return (
    <aside data-testid="debug-panel" className="max-h-40 overflow-y-auto border-t border-[#e4dcd0] bg-[#f3f0e8] px-4 py-2 text-xs leading-relaxed text-[#5c564e]">
      <p>旗标：{formatFlags(state.flags)}</p>
      <p className="mt-1">左侧：{describeChannel(state, "left", script.beats)}</p>
      <p className="mt-1">右侧：{describeChannel(state, "right", script.beats)}</p>
    </aside>
  );
}
