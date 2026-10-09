import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Game } from "./Game";
import { loadBundledScript } from "./engine/loadScript";

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("max-width"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

describe("girl channel", () => {
  it("stays quiet until the boy picks a shop, then sends only that shop's lines", async () => {
    const loaded = loadBundledScript();
    expect(loaded.script).not.toBeNull();
    render(<Game script={loaded.script!} />);

    expect(screen.getByTestId("status-right").textContent).toContain("男生还没选定店");
    expect(screen.queryByText(/我朋友突然叫我去玩桌游/)).toBeNull();

    const left = screen.getByTestId("pane-left");
    await skipUntil(left, "choice");
    fireEvent.click(within(left).getByRole("button", { name: "搜索相关信息，并提供建议" }));
    await skipUntil(left, "choice");
    fireEvent.click(within(left).getByRole("button", { name: "时光桌游吧" }));

    await waitFor(() => {
      const skip = within(left).queryByTestId("skip");
      if (skip) fireEvent.click(skip);
      expect(screen.getByText(/叫 "时光桌游吧"/)).toBeTruthy();
    }, { timeout: 4000 });
    expect(screen.getByTestId("girl-banner").textContent).toContain("女生发来了新消息");
    expect(screen.queryByText(/叫 "心动桌游俱乐部"/)).toBeNull();
    expect(screen.queryByText(/叫 "叙事者营地桌游馆"/)).toBeNull();
  });
});

async function skipUntil(pane: HTMLElement, kind: "choice"): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (within(pane).queryAllByTestId(kind).length > 0) return;
    const skip = within(pane).queryByTestId("skip");
    if (skip) fireEvent.click(skip);
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error("这一侧没有出现选项");
}
