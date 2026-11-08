import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChoicePanel } from "./ChoicePanel";

const choices = [
  { thought: "给出精确路线", reply: "出A口右转", 需记忆: "店的位置" },
  { thought: "凭印象指一个", reply: "出A口往左" },
];

afterEach(() => {
  document.body.innerHTML = "";
});

describe("输入卡三态与置灰门", () => {
  it("active：横排胶囊、选中即发送、有记忆时打小标签", () => {
    const onPick = vi.fn();
    render(
      <ChoicePanel
        mode="active"
        choices={choices}
        gateFor={() => null}
        tagFor={(index) => (index === 0 ? "店的位置" : null)}
        onPick={onPick}
      />,
    );
    expect(screen.getByTestId("composer").getAttribute("data-mode")).toBe("active");
    const buttons = screen.getAllByTestId("choice");
    expect(buttons).toHaveLength(2);
    expect(buttons[0].textContent).toContain("记忆可用");
    expect(screen.getByText("点选一个想法")).toBeTruthy();
    expect(document.querySelector(".send")?.className).not.toContain("off");
    fireEvent.click(buttons[1]);
    expect(onPick).toHaveBeenCalledWith(1);
  });

  it("缺记忆的选项置灰且不可点，不写解释性长句", () => {
    const onPick = vi.fn();
    render(
      <ChoicePanel
        mode="active"
        choices={choices}
        gateFor={(index) => (index === 0 ? "店的位置" : null)}
        onPick={onPick}
      />,
    );
    const buttons = screen.getAllByTestId("choice");
    expect(buttons[0]).toBeDisabled();
    expect(buttons[0].textContent).not.toContain("还没存下这句");
    expect(screen.queryByTestId("memory-tag")).toBeNull();
    fireEvent.click(buttons[1]);
    expect(onPick).toHaveBeenCalledWith(1);
  });

  it("locked / empty 两态只有状态词与灰发送键，没有玩法说明", () => {
    const { unmount } = render(<ChoicePanel mode="locked" choices={[]} onPick={() => {}} />);
    expect(screen.getByText("AI 正在输出")).toBeTruthy();
    expect(screen.queryAllByTestId("choice")).toHaveLength(0);
    expect(document.querySelector(".send")?.className).toContain("off");
    unmount();

    render(<ChoicePanel mode="empty" choices={[]} onPick={() => {}} />);
    expect(screen.getByText("暂无可选想法")).toBeTruthy();
    const body = document.body.textContent ?? "";
    expect(body).not.toContain("无法自由输入");
    expect(body).not.toContain("游戏开始后");
  });
});
