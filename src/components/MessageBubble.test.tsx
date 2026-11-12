import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageBubble } from "./MessageBubble";

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("参考稿的三级文字层级", () => {
  it("用户消息靠左灰泡、AI 消息靠右纯文字，都没有名字与头像", () => {
    const { container } = render(
      <>
        <MessageBubble from="boy" text="对面说的话" delivery="pop" />
        <MessageBubble from="ai" text="AI 说的话" delivery="type" />
      </>,
    );
    const rows = container.querySelectorAll(".msg-row");
    expect(rows[0].className).toContain("left");
    expect(rows[1].className).toContain("right");
    expect(container.querySelector(".msg-user")?.textContent).toBe("对面说的话");
    expect(container.querySelector(".msg-ai")?.textContent).toBe("AI 说的话");
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.textContent).not.toContain("男生");
  });

  it("逐字速度由该条消息自己的 typeIntervalMs 决定", () => {
    vi.useFakeTimers();
    const onFinished = vi.fn();
    render(
      <MessageBubble
        from="ai"
        text="你好"
        delivery="type"
        animate
        typeIntervalMs={250}
        onFinished={onFinished}
      />,
    );
    expect(screen.getByTestId("bubble-text").querySelector(".msg-ink")?.textContent).toBe("你");
    act(() => vi.advanceTimersByTime(100));
    expect(screen.getByTestId("bubble-text").querySelector(".msg-ink")?.textContent).toBe("你");
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByTestId("bubble-text").querySelector(".msg-ink")?.textContent).toBe("你好");
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it("AI 思考不进消息流（交给输入卡上方的思考块）", () => {
    const { container } = render(<MessageBubble from="ai" text="这是自言自语" delivery="thought" />);
    expect(container.innerHTML).toBe("");
  });

  it("图片消息带图说", () => {
    render(<MessageBubble from="boy" text="/cards/note.png" delivery="image" caption="一张纸条" />);
    expect(screen.getByRole("img", { name: "一张纸条" })).toHaveAttribute("src", "/cards/note.png");
    expect(screen.getByText("一张纸条")).toBeInTheDocument();
  });

  it("记忆高亮可点存档，已存后不再可点", () => {
    const onSave = vi.fn();
    const { rerender } = render(
      <MessageBubble
        from="boy"
        text="店在老位置"
        delivery="pop"
        marks={[{ text: "老位置", saved: false }]}
        onSaveMark={onSave}
      />,
    );
    const mark = screen.getByTestId("memory-mark");
    expect(mark.className).toContain("memory-mark");
    fireEvent.click(mark);
    expect(onSave).toHaveBeenCalledWith("老位置");

    rerender(
      <MessageBubble from="boy" text="店在老位置" delivery="pop" marks={[{ text: "老位置", saved: true }]} />,
    );
    expect(screen.getByTestId("memory-mark").className).toContain("memory-mark-saved");
  });
});

