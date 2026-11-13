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
  it("固定画布、双窗和常驻档案，无调试 UI", () => {
    const loaded = loadBundledScript();
    expect(loaded.script).not.toBeNull();
    render(<Game script={loaded.script!} />);
    expect(screen.getByTestId("game-canvas")).toBeTruthy();
    expect(screen.getByTestId("game-title")).toHaveTextContent(/^He said, she said$/);
    expect(screen.getByTestId("pane-left")).toBeTruthy();
    expect(screen.getByTestId("pane-right")).toBeTruthy();
    expect(screen.getByTestId("terminal-archive")).toBeTruthy();
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

  it("非开局章节的顶栏也只显示游戏名", () => {
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
    expect(screen.getByTestId("game-title")).toHaveTextContent(/^He said, she said$/);
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

  it("上下文重置系统行只出现在正在重置的那一侧", () => {
    const loaded = loadBundledScript();
    expect(loaded.script).not.toBeNull();
    const script = loaded.script!;
    const state = {
      ...createInitial(script.beats),
      context: { left: 1 },
      ritual: {
        left: { from: 4, to: 5, contextTo: 2, phase: "mask" as const, until: Date.now() + 60_000 },
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

  it("固定画布与分窗定位", () => {
    const css = readFileSync(`${process.cwd()}/src/index.css`, "utf8");
    expect(css).toMatch(/\.pane\s*\{[^}]*position:\s*relative/);

    expect(css).toMatch(/\.game-canvas\s*\{[^}]*width:\s*1440px;\s*height:\s*920px/);
  });

  it("窗头 MEM 原位展开，再点或点外面收起，永远不打开旧弹窗", () => {
    render(<Game script={loadBundledScript().script!} />);
    const counter = screen.getByTestId("memory-counter-left");
    expect(counter).toHaveTextContent("[MEM");
    fireEvent.click(counter);
    expect(counter).toHaveAttribute("aria-expanded", "true");
    expect(counter).toHaveTextContent("Memory 数量");
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(counter);
    expect(counter).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(counter);
    fireEvent.pointerDown(screen.getByTestId("terminal-archive"));
    expect(counter).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(counter);
    fireEvent.blur(counter);
    expect(counter).toHaveAttribute("aria-expanded", "false");
  });
});
