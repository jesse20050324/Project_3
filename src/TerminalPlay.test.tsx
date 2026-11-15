import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { Game } from "./Game";
import { loadBundledScript } from "./engine/loadScript";
import { createInitial } from "./engine/scheduler";
import { saveProgress } from "./engine/storage";
import type { Beat, EngineState } from "./engine/types";

function setMotion(reduced: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: reduced, addEventListener() {}, removeEventListener() {},
  });
}

function stored(): EngineState {
  return JSON.parse(localStorage.getItem("shuangxian.progress.v2")!).state;
}

beforeEach(() => {
  localStorage.clear();
  setMotion(true);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("开机停留 1.5 秒，先画线再从左到右开窗，完整界面等 1.5 秒才启动第一条", () => {
  setMotion(false);
  vi.useFakeTimers();
  localStorage.setItem("shuangxian.language", "zh");
  render(<App />);
  expect(screen.getByRole("button", { name: "开始游戏" })).toHaveAttribute("data-current", "true");
  fireEvent.keyDown(window, { key: "Enter" });

  const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
  for (let n = 0; n < 500 && !screen.getByTestId("boot-console").hasAttribute("data-hold"); n++) advance(20);
  expect(screen.getByTestId("boot-console")).toHaveTextContent("载入用户信息 · 男生");
  expect(screen.getByTestId("boot-console")).toHaveTextContent("载入用户信息 · 女生");
  expect(screen.getByTestId("boot-console")).toHaveAttribute("data-hold");
  advance(1460);
  expect(screen.getByTestId("boot-console")).toBeInTheDocument();
  expect(localStorage.getItem("shuangxian.progress.v2")).toBeNull();

  advance(400);
  const canvas = screen.getByTestId("game-canvas");
  const value = (name: string) => parseFloat(canvas.style.getPropertyValue(`--intro-${name}`));
  expect(value("dividers")).toBeGreaterThan(0);
  expect(value("dividers")).toBeLessThan(100);
  expect(value("left")).toBe(0);
  advance(940);
  expect(value("dividers")).toBe(100);
  expect(value("left")).toBeGreaterThan(0);
  expect(value("left")).toBeLessThan(100);
  expect(value("right")).toBe(0);
  advance(420);
  expect(value("left")).toBe(100);
  expect(value("right")).toBeGreaterThan(0);
  expect(value("right")).toBeLessThan(100);
  expect(value("archive")).toBe(0);
  advance(420);
  expect(value("right")).toBe(100);
  expect(value("archive")).toBeGreaterThan(0);
  expect(value("archive")).toBeLessThan(100);

  for (let n = 0; n < 30 && value("archive") < 100; n++) advance(20);
  expect(value("archive")).toBe(100);
  expect(canvas).toHaveAttribute("inert");
  advance(1460);
  expect(canvas).toHaveAttribute("inert");
  expect(localStorage.getItem("shuangxian.progress.v2")).toBeNull();
  expect(screen.queryByTestId("message-wait-left")).toBeNull();

  advance(60);
  expect(screen.getByTestId("game-canvas")).toBe(canvas);
  expect(canvas).not.toHaveAttribute("inert");
  expect(stored().pending.left).toMatchObject({ kind: "lines", beatId: "L1" });
});
it.each([false, true])("使用真实章节从标题到第八幕结局，键鼠混用=%s", (mixed) => {
  localStorage.setItem("shuangxian.language", "zh");
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "开始游戏" }));
  const seen = new Set<number>();
  let keyboard = 0;
  let saved = 0;
  let gated = 0;
  for (let step = 0; step < 250 && !stored().endings.includes("分手"); step++) {
    const state = stored();
    Object.values(state.chapter).forEach(chapter => seen.add(chapter));
    const options = screen.queryAllByTestId("choice");
    gated += options.filter(node => node.hasAttribute("data-gated")).length;
    for (const name of ["left", "right"] as const) {
      const pane = within(screen.getByTestId(`pane-${name}`));
      const current = stored();
      for (const mark of pane.queryAllByTestId("memory-mark").filter(node => node.dataset.saved === "false")) {
        if (current.chapter[name] >= 5 && (stored().memories[name].length >= 4 || mixed)) break;
        if (mixed && current.chapter[name] === 1) break;
        fireEvent.click(mark);
        saved++;
      }
    }
    const button = options.find(option => !option.hasAttribute("disabled"));
    expect(button, JSON.stringify(state.pending)).toBeDefined();
    if (mixed && step % 2 === 0) {
      const pane = button!.closest("[data-testid^='pane-']")!;
      const toLeft = pane.getAttribute("data-testid") === "pane-left";
      fireEvent.keyDown(window, { key: toLeft ? "ArrowLeft" : "ArrowRight" });
      expect(pane).toHaveAttribute("data-focused", "true");
      expect(document.querySelectorAll(".choice-line[data-current]")).toHaveLength(1);
      fireEvent.keyDown(window, { key: "Enter" });
      keyboard++;
    } else fireEvent.click(button!);
  }
  const final = stored();
  expect(final.error).toBeNull();
  expect(final.endings).toContain("分手");
  expect(screen.getByText("结局 · 分手")).toBeInTheDocument();
  expect([...seen].sort()).toEqual([1, 3, 4, 5, 6, 7, 8]);
  for (const channel of ["left", "right"] as const) {
    expect(final.archive?.[channel].map(entry => entry.section)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const tabletop = final.archive?.[channel][0].beatIds ?? [];
    expect(tabletop.some(id => id.startsWith("3."))).toBe(true);
    expect(tabletop.some(id => id.startsWith("4."))).toBe(true);
  }
  expect(saved).toBeGreaterThan(0);
  if (mixed) {
    expect(keyboard).toBeGreaterThan(1);
    expect(gated).toBeGreaterThan(0);
  }
});

it("桌游聚会内各窗按各自时机清理聊天，未交换微信时仍只归档一段", () => {
  localStorage.setItem("shuangxian.language", "zh");
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "开始游戏" }));
  for (let step = 0; step < 40 && !stored().endings.includes("未交换微信"); step++) {
    const state = stored();
    const choices = screen.getAllByTestId("choice").filter(button => !button.hasAttribute("disabled"));
    const stop = choices.find(button => /今天先放一放|暂时先不问/.test(button.textContent ?? ""));
    fireEvent.click(stop ?? choices[0]);
    expect(state.ritual).toEqual({ left: null, right: null });
    if (!stored().endings.includes("未交换微信")) {
      expect(within(screen.getByTestId("terminal-archive")).queryByText("桌游聚会")).toBeNull();
    }
  }
  const state = stored();
  expect(state.endings).toContain("未交换微信");
  for (const channel of ["left", "right"] as const) {
    expect(state.archive?.[channel].map(entry => entry.section)).toEqual([1]);
    expect(state.archive?.[channel][0].beatIds.some(id => id.startsWith(channel === "left" ? "L" : "R"))).toBe(true);
    const pane = within(within(screen.getByTestId(`pane-${channel}`)).getByRole("log"));
    expect(pane.queryByText("聚会当天 · 出发前")).toBeNull();
    const labels = channel === "left" ? ["散场后"] : ["在路上", "到店后 · 局间", "散场后"];
    for (const label of labels) {
      expect(pane.getAllByText(label)).toHaveLength(1);
    }
  }
  expect(within(screen.getByTestId("terminal-archive")).getAllByText("桌游聚会")).toHaveLength(2);
});

it("切换焦点不推进播放，回车可以完成唯一一条正在播的消息", () => {
  setMotion(false);
  const script = loadBundledScript().script!;
  render(<Game script={script} />);
  const pending = stored().pending;
  const side = pending.left ? "right" : "left";
  fireEvent.keyDown(window, { key: side === "left" ? "ArrowLeft" : "ArrowRight" });
  expect(stored().pending).toEqual(pending);
  fireEvent.keyDown(window, { key: "Enter" });
  expect(stored().messages.some(message => message.beatId === "L1")).toBe(true);
  expect(screen.getByTestId(`pane-${side}`)).toHaveAttribute("data-focused", "true");
});

it("上下键和鼠标使用同一行光标，回车只提交那一行", () => {
  setMotion(false);
  const bundled = loadBundledScript().script!;
  const beat = bundled.beats.find(item => item.id === "L2")!;
  const script = { ...bundled, beats: [beat], beatById: new Map([[beat.id, beat]]) };
  const initial = createInitial(script.beats);
  saveProgress({ ...initial, pending: { left: { kind: "choices", beatId: beat.id }, right: null } });
  render(<Game script={script} />);
  const buttons = screen.getAllByTestId("choice");
  expect(buttons).toHaveLength(3);
  expect(buttons[0]).toHaveAttribute("data-current", "true");
  fireEvent.keyDown(window, { key: "ArrowDown" });
  expect(buttons[1]).toHaveAttribute("data-current", "true");
  fireEvent.mouseEnter(buttons[2]);
  expect(buttons[2]).toHaveAttribute("data-current", "true");
  expect(document.querySelectorAll(".choice-line[data-current]")).toHaveLength(1);
  fireEvent.keyDown(window, { key: "Enter" });
  expect(stored().pending.left).toMatchObject({ kind: "reply", choiceIndex: 2 });
});

it("思考自然打完就出选项，即使这拍配置了留白且另一窗还在播", () => {
  setMotion(false);
  vi.useFakeTimers();
  const script = loadBundledScript().script!;
  const original = script.beats.find(item => item.id === "L2")!;
  const timing = { pauseBeforeMs: 0, indicatorMs: 80, typeIntervalMs: 30, afterMs: 4500 };
  const thought = "先按人数确认哪家有大桌。";
  const left: Beat = { ...original, lines: [{ from: "ai", text: thought, delivery: "thought" as const, timing }] };
  const right: Beat = { ...left, id: "test-right", channel: "right" as const, choices: undefined,
    lines: [{ from: "girl", text: "我还在找朋友问地址。", delivery: "type" as const, timing: { ...timing, indicatorMs: 1000 } }] };
  const fixture = { ...script, beats: [left, right], beatById: new Map([[left.id, left], [right.id, right]]) };
  saveProgress({ ...createInitial(fixture.beats), pending: {
    left: { kind: "lines", beatId: left.id, lineIndex: 0 }, right: { kind: "lines", beatId: right.id, lineIndex: 0 },
  } });
  render(<Game script={fixture} />);
  const pane = within(screen.getByTestId("pane-left"));
  expect(pane.getByTestId("think-left")).toHaveTextContent("[THINKING]");
  expect(pane.getByTestId("think-left")).toHaveTextContent("正在思考");
  expect(pane.queryByTestId("choice")).toBeNull();
  const incoming = screen.getByTestId("message-wait-right");
  expect(incoming.closest(".messages")).not.toBeNull();
  act(() => vi.advanceTimersByTime(80));
  expect(pane.getByTestId("think-left")).toHaveTextContent("先");
  expect(pane.getByTestId("think-left")).not.toHaveTextContent(thought);
  expect(pane.queryByTestId("choice")).toBeNull();
  for (let i = 0; i < thought.length - 2; i++) act(() => vi.advanceTimersByTime(30));
  expect(pane.queryByTestId("choice")).toBeNull();
  act(() => vi.advanceTimersByTime(30));
  expect(pane.getByTestId("think-left")).toHaveTextContent(thought);
  expect(pane.getAllByTestId("choice")[0]).toBeEnabled();
  fireEvent.keyDown(window, { key: "ArrowLeft" });
  fireEvent.keyDown(window, { key: "Enter" });
  expect(pane.queryByTestId("think-left")).toBeNull();
  expect(stored().pending.right).toMatchObject({ kind: "lines" });
  expect(stored().pending.left).toMatchObject({ kind: "reply" });
  fireEvent.keyDown(window, { key: "ArrowLeft" });
  fireEvent.keyDown(window, { key: "Enter" });
  expect(pane.getByTestId("bubble-text").textContent).toBe(left.choices![0].reply);
  expect(pane.queryByTestId("think-left")).toBeNull();
  expect(stored().pending.right).toMatchObject({ kind: "lines" });
});

it("段首虚线立即显示，段内普通接续等一次，跳时分开等线前与线后", () => {
  setMotion(false);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
  const bundled = loadBundledScript().script!;
  const original = bundled.beats.find(beat => beat.id === "L1")!;
  const timing = { pauseBeforeMs: 0, indicatorMs: 160, typeIntervalMs: 215, afterMs: 900 };
  const opening: Beat = { ...original, id: "test-start", next: "test-next", choices: undefined,
    context: { section: 1, entryTime: "见面之后" },
    lines: [{ from: "boy", text: "甲乙", delivery: "type", timing }] };
  const next: Beat = { ...opening, id: "test-next", next: "test-jump",
    context: { section: 1 }, lines: [{ ...opening.lines[0], text: "丙丁" }] };
  const jump: Beat = { ...next, id: "test-jump", next: undefined,
    context: { section: 1, time: "第二天" }, lines: [{ ...opening.lines[0], text: "戊己" }] };
  const beats = [opening, next, jump];
  render(<Game script={{ ...bundled, beats, beatById: new Map(beats.map(beat => [beat.id, beat])) }} />);
  const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
  const waiting = () => screen.queryByTestId("message-wait-left");

  expect(screen.getByText("见面之后")).toBeInTheDocument();
  expect(waiting()).toBeInTheDocument();
  advance(2499);
  expect(screen.queryByText("甲")).toBeNull();
  advance(1);
  expect(screen.getByText("甲")).toBeInTheDocument();
  advance(100);
  expect(screen.getByText("甲乙")).toBeInTheDocument();
  advance(1049);
  expect(waiting()).toBeNull();
  advance(1);
  expect(waiting()).toBeInTheDocument();
  advance(100);
  expect(screen.getByText("丙")).toBeInTheDocument();
  advance(100);
  expect(screen.getByText("丙丁")).toBeInTheDocument();

  advance(3999);
  expect(screen.queryByText("第二天")).toBeNull();
  expect(waiting()).toBeNull();
  advance(1);
  expect(screen.getByText("第二天")).toBeInTheDocument();
  expect(waiting()).toBeInTheDocument();
  advance(2499);
  expect(screen.queryByText("戊")).toBeNull();
  advance(1);
  expect(screen.getByText("戊")).toBeInTheDocument();
});

it.each([
  { gate: "requires", divider: false, wait: 2000 },
  { gate: "requires", divider: true, wait: 4000 },
  { gate: "lower", divider: false, wait: 2000 },
  { gate: "upper", divider: false, wait: 2000 },
])("跨窗 $gate 和本窗间隔同时计时（虚线 $divider）", ({ gate, divider, wait }) => {
  setMotion(false);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
  const bundled = loadBundledScript().script!;
  const original = bundled.beats.find(beat => beat.id === "L1")!;
  const timing = { pauseBeforeMs: 0, indicatorMs: 0, typeIntervalMs: 215, afterMs: 0 };
  const left: Beat = { ...original, id: "test-left", next: undefined, choices: undefined,
    window: gate === "upper" ? { channel: "right", 下界: [], 上界: ["test-result"] } : undefined,
    context: { section: 1 }, lines: [{ from: "boy", text: "甲乙", delivery: "type", timing }] };
  const right: Beat = { ...left, id: "test-right", channel: "right", next: "test-result", window: undefined,
    lines: [{ from: "girl", text: "丙丁", delivery: "type", timing }] };
  const result: Beat = { ...right, id: "test-result", next: undefined, requires: gate === "requires" ? [left.id] : undefined,
    window: gate === "lower" ? { channel: "left", 下界: [left.id], 上界: [] } : undefined,
    context: { section: 1, ...(divider ? { time: "第二天" } : {}) },
    lines: [{ ...right.lines[0], text: "戊己", timing: { ...timing, indicatorMs: 160 } }] };
  const beats = [left, right, result];
  saveProgress({ ...createInitial(beats), pending: {
    left: { kind: "lines", beatId: left.id, lineIndex: 0 }, right: { kind: "lines", beatId: right.id, lineIndex: 0 },
  } });
  render(<Game script={{ ...bundled, beats, beatById: new Map(beats.map(beat => [beat.id, beat])) }} />);
  const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
  advance(100);
  expect(screen.getByText("甲乙")).toBeInTheDocument();
  expect(screen.getByText("丙丁")).toBeInTheDocument();
  advance(wait - 1);
  expect(screen.queryByTestId("message-wait-right")).toBeNull();
  expect(screen.queryByText("第二天")).toBeNull();
  advance(1);
  expect(screen.getByTestId("message-wait-right")).toBeInTheDocument();
  if (divider) expect(screen.getByText("第二天")).toBeInTheDocument();
  advance(divider ? 2500 : 100);
  expect(screen.getByText("戊")).toBeInTheDocument();
});
