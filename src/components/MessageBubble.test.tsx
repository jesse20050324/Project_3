import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TYPE_INTERVAL_MS } from "../presentation";
import { MessageBubble } from "./MessageBubble";

afterEach(() => {
  vi.useRealTimers();
});

describe("MessageBubble", () => {
  it("types character by character and shows a pop line all at once", () => {
    vi.useFakeTimers();
    const onFinished = vi.fn();
    const { rerender } = render(
      <MessageBubble from="boy" speakerName="男生" text="你好" delivery="type" animate onFinished={onFinished} />,
    );
    expect(screen.getByTestId("bubble-text").textContent).toBe("你");
    act(() => {
      vi.advanceTimersByTime(TYPE_INTERVAL_MS);
    });
    expect(screen.getByTestId("bubble-text").textContent).toBe("你好");
    expect(onFinished).toHaveBeenCalledTimes(1);

    rerender(<MessageBubble from="ai" speakerName="AI" text="一下子出现" delivery="pop" animate={false} />);
    expect(screen.getByTestId("bubble-text").textContent).toBe("一下子出现");
    expect(screen.getByTestId("bubble-text").className).toContain("bg-[#24312e]");
  });

  it("renders an image message with its caption", () => {
    render(
      <MessageBubble
        from="boy"
        speakerName="男生"
        text="/cards/note.png"
        delivery="image"
        caption="一张纸条"
        animate={false}
      />,
    );
    const image = screen.getByRole("img", { name: "一张纸条" });
    expect(image).toHaveAttribute("src", "/cards/note.png");
    expect(screen.getByText("一张纸条")).toBeInTheDocument();
    expect(screen.getByText("男生")).toBeInTheDocument();
  });
});
