import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChoicePanel } from "./ChoicePanel";

const choices = [
  { thought: "给出精确路线", reply: "出A口右转", 需记忆: "店的位置" },
  { thought: "凭印象指一个", reply: "出A口往左" },
];

afterEach(cleanup);

describe("终端选项", () => {
  it("持有记忆时两条都可点，仅当前项显示光标", () => {
    const onPick = vi.fn();
    const onMove = vi.fn();
    render(<ChoicePanel mode="active" choices={choices} selected={0}
      memoryGate={() => null} onMove={onMove} onPick={onPick} />);
    const buttons = screen.getAllByTestId("choice");
    expect(buttons[0]).toHaveAttribute("data-current", "true");
    expect(buttons[1]).not.toHaveAttribute("data-current");
    expect(buttons[0]).toHaveTextContent("[MEM]");
    fireEvent.mouseEnter(buttons[1]);
    expect(onMove).toHaveBeenCalledWith(1);
    fireEvent.click(buttons[1]);
    expect(onPick).toHaveBeenCalledWith(1);
  });

  it("缺记忆的选项标记且不可发送，普通选项仍可用", () => {
    const onPick = vi.fn();
    render(<ChoicePanel mode="active" choices={choices} selected={1}
      memoryGate={choice => choice.需记忆 ?? null} onMove={() => {}} onPick={onPick} />);
    const buttons = screen.getAllByTestId("choice");
    expect(buttons[0]).toBeDisabled();
    expect(buttons[0]).toHaveTextContent("[MEM]");
    fireEvent.click(buttons[0]);
    expect(onPick).not.toHaveBeenCalled();
    fireEvent.click(buttons[1]);
    expect(onPick).toHaveBeenCalledWith(1);
  });
});
