import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ChoicePanel } from "./ChoicePanel";

const choices = [
  { thought: "给出精确路线", reply: "出A口右转", 需记忆: "店的位置" },
  { thought: "凭印象指一个", reply: "出A口往左" },
];

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ChoicePanel memory feedback", () => {
  it("tags a choice unlocked by a saved memory with 记忆可用", () => {
    render(
      <ChoicePanel
        choices={choices}
        gateFor={() => null}
        tagFor={(index) => (index === 0 ? "店的位置" : null)}
        onPick={() => {}}
      />,
    );
    const buttons = screen.getAllByTestId("choice");
    expect(buttons[0].textContent).toContain("记忆可用：店的位置");
    expect(buttons[0].textContent).not.toContain("还没存下这句");
    expect(buttons[1].textContent).not.toContain("记忆可用");
    expect(within(buttons[0] as HTMLElement).getByTestId("memory-tag").textContent).toContain("店的位置");
  });

  it("keeps the gated hint when the memory is missing", () => {
    render(
      <ChoicePanel
        choices={choices}
        gateFor={(index) => (index === 0 ? "店的位置" : null)}
        tagFor={() => null}
        onPick={() => {}}
      />,
    );
    const buttons = screen.getAllByTestId("choice");
    expect(buttons[0]).toBeDisabled();
    expect(buttons[0].textContent).toContain("需要记忆：店的位置（还没存下这句）");
    expect(screen.queryByTestId("memory-tag")).toBeNull();
    expect(buttons[1]).toBeEnabled();
    expect(() => fireEvent.click(buttons[1])).not.toThrow();
  });
});
