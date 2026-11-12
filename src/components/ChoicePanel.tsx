import type { Choice } from "../engine/types";

export type ComposerMode = "active" | "locked" | "empty";

export function ChoicePanel({ mode, choices, selected, onMove, onPick, memoryGate }: {
  mode: ComposerMode;
  choices: Choice[];
  selected: number;

  onMove: (index: number) => void;
  onPick: (index: number) => void;
  memoryGate: (choice: Choice) => string | null;
}) {
  return <div className="choice-list" data-testid="composer" data-mode={mode}>
    {mode === "active" ? <div role="group" aria-label="选一个想法">
      {choices.map((choice, index) => {
        const need = memoryGate(choice);
        const gated = need !== null;
        const current = !gated && selected === index;
        return <button key={index} type="button" data-testid="choice" data-index={index}
          data-gated={gated || undefined} disabled={gated}
          title={gated ? `需要记忆：${need}` : undefined}
          onMouseEnter={() => onMove(index)} onFocus={() => onMove(index)}
          onClick={() => onPick(index)} className="choice-line" data-current={current || undefined}>
          <span className="choice-cursor" aria-hidden="true">{current ? ">" : ""}</span>
          <span>{choice.需记忆 || choice.记忆后继 ? <span className="memory-tag" data-testid="memory-tag">[MEM] </span> : null}{choice.thought}</span>
        </button>;
      })}
    </div> : null}
  </div>;
}
