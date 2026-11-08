import type { Choice } from "../engine/types";
import { SendIcon } from "./icons";

export type ComposerMode = "active" | "locked" | "empty";

type Props = {
  mode: ComposerMode;
  choices: Choice[];
  /** 返回该选项置灰所需的记忆标签；null 或缺省表示可选项。 */
  gateFor?: (index: number) => string | null;
  /** 返回该选项已持有的记忆标签（打「记忆可用」小标签）。 */
  tagFor?: (index: number) => string | null;
  onPick: (index: number) => void;
};

/**
 * 参考稿的输入长条卡：横排可换行胶囊、选中即发送（无独立提交步骤）。
 * 三态只靠底色、chip 灰度与右下角那颗圆形发送键表达，不写一句玩法说明。
 */
export function ChoicePanel({ mode, choices, gateFor, tagFor, onPick }: Props) {
  const active = mode === "active";
  const hint = active ? "点选一个想法" : mode === "locked" ? "AI 正在输出" : "暂无可选想法";

  return (
    <div className={`input-card ${active ? "" : "locked"}`} data-testid="composer" data-mode={mode}>
      {active && choices.length > 0 ? (
        <div className="chips" role="group" aria-label="选一个想法">
          {choices.map((choice, index) => {
            const gate = gateFor?.(index) ?? null;
            const tag = gate === null ? tagFor?.(index) ?? null : null;
            return (
              <button
                key={`${index}-${choice.thought}`}
                type="button"
                data-testid="choice"
                data-gated={gate === null ? undefined : "true"}
                disabled={gate !== null}
                title={gate ?? undefined}
                onClick={() => onPick(index)}
                className="chip"
              >
                {choice.thought}
                {tag !== null ? <span className="memory-tag" data-testid="memory-tag">记忆可用</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="card-bottom">
        <span className="card-hint">{hint}</span>
        <button
          type="button"
          className={`send ${active ? "" : "off"}`}
          disabled={!active}
          aria-label="发送"
          tabIndex={-1}
        >
          <SendIcon size={15} />
        </button>
      </div>
    </div>
  );
}
