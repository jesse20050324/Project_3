import { memoryName, useLanguage } from "../language";
import type { Choice } from "../engine/types";

export type ComposerMode = "active" | "locked" | "empty";

export function ChoicePanel({ mode, choices, selected, onMove, onPick, memoryGate, matchedMemories }: {
  mode: ComposerMode;
  choices: Choice[];
  selected: number;

  onMove: (index: number) => void;
  onPick: (index: number) => void;
  memoryGate: (choice: Choice) => string | null;
  matchedMemories: (choice: Choice) => readonly string[];
}) {
  const { t } = useLanguage();
  return <div className="choice-list" data-testid="composer" data-mode={mode}>
    {mode === "active" ? <div role="group" aria-label={t("选一个想法", "Choose a thought")}>
      {choices.map((choice, index) => {
        const need = memoryGate(choice);
        const gated = need !== null;
        const current = !gated && selected === index;
        const labels = gated ? [] : [...new Set([
          ...(choice.需记忆 ? [choice.需记忆] : []), ...matchedMemories(choice),
        ])].map(label => t(label, memoryName(label)));
        return <button key={index} type="button" data-testid="choice" data-index={index}
          data-gated={gated || undefined} disabled={gated}
          onMouseEnter={() => onMove(index)} onFocus={() => onMove(index)}
          onClick={() => onPick(index)} className="choice-line" data-current={current || undefined}>
          <span className="choice-cursor" aria-hidden="true">{current ? ">" : ""}</span>
          <span>{choice.需记忆 || choice.记忆后继 ? <span className="memory-tag" data-testid="memory-tag">
            [MEM{labels.length ? ` · ${labels.join(t("、", ", "))}` : ""}]{" "}
          </span> : null}{choice.thought}</span>
        </button>;
      })}
    </div> : null}
  </div>;
}
