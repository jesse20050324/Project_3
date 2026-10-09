import type { Choice } from "../engine/types";

type Props = {
  aside?: string;
  choices: Choice[];
  onPick: (index: number) => void;
};

export function ChoicePanel({ aside, choices, onPick }: Props) {
  return (
    <div className="border-t border-[#e4dcd0] bg-[#f4f1ea] px-3 py-3">
      <p className="mb-2 text-[11px] tracking-[0.14em] text-[#6b645b]">自言自语</p>
      {aside ? (
        <div className="mb-3 max-h-28 overflow-y-auto border-l-2 border-[#2f5d54] pl-3 text-sm leading-relaxed text-[#3e4a45]">
          {aside}
        </div>
      ) : null}
      <div role="group" aria-label="选一个想法" className="flex flex-col gap-2">
        {choices.map((choice, index) => (
          <button
            key={`${index}-${choice.thought}`}
            type="button"
            data-testid="choice"
            onClick={() => onPick(index)}
            className="rounded-xl border border-[#ddd4c6] bg-white px-3 py-2.5 text-left text-[15px] leading-relaxed text-[#1c1915] transition-colors hover:border-[#2f5d54] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f5d54]"
          >
            {choice.thought}
          </button>
        ))}
      </div>
    </div>
  );
}
