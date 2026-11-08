import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseScript, loadBundledScript } from "./engine/loadScript";
import { createInitial } from "./engine/scheduler";
import { assignSchedule } from "./engine/timeline";
import { Game } from "./Game";

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

afterEach(cleanup);

describe("游戏主画面", () => {
  it("固定画布 + 双栏 + 顶栏只剩重新开始，且没有解释玩法或调试类 UI", () => {
    const loaded = loadBundledScript();
    expect(loaded.script).not.toBeNull();
    render(<Game script={loaded.script!} />);
    expect(screen.getByTestId("game-canvas")).toBeTruthy();
    const title = screen.getByTestId("chapter-title").textContent ?? "";
    expect(title).toContain("He said, she said");
    expect(title).toContain("第一幕");
    expect(title).not.toContain("双线");
    expect(screen.getByTestId("pane-left")).toBeTruthy();
    expect(screen.getByTestId("pane-right")).toBeTruthy();
    expect(screen.getByText("助手 · 双会话")).toBeTruthy();
    expect(screen.getByTestId("restart")).toBeTruthy();
    expect(screen.queryByTestId("debug-toggle")).toBeNull();
    expect(screen.queryByTestId("debug-panel")).toBeNull();
    expect(screen.queryByTestId("speed-1")).toBeNull();
    expect(screen.queryByTestId("speed-4")).toBeNull();
    expect(screen.queryByText("结构")).toBeNull();
    expect(screen.queryByText("调试")).toBeNull();
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("男生还没选定店");
    expect(text).not.toContain("无法自由输入");
    expect(text).not.toContain("游戏开始后");
    expect(screen.queryByTestId("girl-banner")).toBeNull();
  });

  it("章标题按持久化章号显示，不再永远第一幕", () => {
    const script = assignSchedule(parseScript([
      "title: 测试 · 第三章",
      "chapter: 3",
      "默认节拍: 极快",
      "speakers:",
      "  - { id: boy, name: 男生, channel: left }",
      "  - { id: girl, name: 女生, channel: right }",
      "  - { id: ai, name: AI }",
      "beats:",
      "  - id: L1",
      "    channel: left",
      "    lines:",
      "      - { from: boy, text: 你好, delivery: pop }",
      "    choices:",
      "      - { thought: 回一句, reply: 好的, next: L2 }",
      "  - id: L2",
      "    channel: left",
      "    lines:",
      "      - { from: boy, text: 再说, delivery: pop }",
    ].join("\n")));
    render(<Game script={script} />);
    expect(screen.getByTestId("chapter-title").textContent).toContain("第三幕");
  });

  it("重新开始走确认弹层", () => {
    const loaded = loadBundledScript();
    render(<Game script={loaded.script!} />);
    fireEvent.click(screen.getByTestId("restart"));
    expect(screen.getByText("确定重来？")).toBeTruthy();
    expect(screen.getByText("当前两条线的进度都会清空，回到第一幕开头。")).toBeTruthy();
    fireEvent.click(screen.getByTestId("restart-confirm"));
    expect(screen.queryByText("确定重来？")).toBeNull();
  });

  it("上下文重置蒙版只出现在正在重置的那一侧", () => {
    const loaded = loadBundledScript();
    expect(loaded.script).not.toBeNull();
    const script = loaded.script!;
    const state = {
      ...createInitial(script.beats),
      ritual: {
        left: { from: 1, to: 3, phase: "mask" as const, until: Date.now() + 60_000 },
        right: null,
      },
    };
    localStorage.setItem("shuangxian.progress.v2", JSON.stringify({ version: 2, state }));
    render(<Game script={script} />);
    const leftPane = screen.getByTestId("pane-left");
    const rightPane = screen.getByTestId("pane-right");
    expect(within(leftPane).getByTestId("resetting-left")).toBeTruthy();
    expect(within(rightPane).queryByTestId("resetting-right")).toBeNull();
    expect(within(rightPane).queryByText("上下文重置中")).toBeNull();
  });

  it("单窗浮层以 .pane 为定位上下文，不会铺满整块画布", () => {
    const css = readFileSync(`${process.cwd()}/src/index.css`, "utf8");
    expect(css).toMatch(/\.pane\s*\{[^}]*position:\s*relative/);
    expect(css).toMatch(/\.ritual-mask\s*\{[^}]*position:\s*absolute/);
    expect(css).toMatch(/\.memory-dialog\s*\{[^}]*position:\s*absolute/);
  });
});
