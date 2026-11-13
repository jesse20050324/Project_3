import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadBundledScript } from "./engine/loadScript";
import { createInitial } from "./engine/scheduler";
import { saveProgress } from "./engine/storage";
import type { EngineState } from "./engine/types";
import { Game } from "./Game";
import { summariesFor } from "./contextSummaries";

beforeEach(() => {
  localStorage.clear();
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false, addEventListener() {}, removeEventListener() {},
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("候选摘要覆盖已载入所有可见节拍，分支文本只来自实播编号", () => {
  const script = loadBundledScript().script!;
  const beats = script.beats.filter(beat => beat.lines.some(line => line.delivery !== "thought"));
  for (const beat of beats) {
    const summary = summariesFor({ chapter: beat.chapter ?? 1, beatIds: [beat.id] });
    expect(summary, beat.id).toHaveLength(1);
    expect(summary[0].text, beat.id).not.toBe("本次会话还有其他已处理消息。");
    expect(summary[0].beatIds).toEqual([beat.id]);
  }
  expect(summariesFor({ chapter: 6, beatIds: ["6f.F3B"] }).map(entry => entry.text)).toEqual([
    "她把照片发给闺蜜，闺蜜打来电话。",
  ]);
});

it("重置时刷新保留单侧归档及来源，原话只对持有的记忆可展开", () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  const script = loadBundledScript().script!;
  const beat = script.beats.find(item => item.id === "5m.2.5")!;
  const memoryBeat = script.beatById!.get("5m.2.1")!;
  const memory = memoryBeat.记忆候选![0];
  const state = createInitial(script.beats);
  saveProgress({
    ...state,
    completed: [memoryBeat.id, beat.id],
    messages: [{ id: "old", beatId: memoryBeat.id, channel: "left", from: "boy", text: memory.短句, delivery: "pop" }],
    memories: { left: [{ label: memory.缩略标签, text: memory.短句, beatId: memoryBeat.id }], right: [] },
    chapter: { left: 5, right: 1 },
    context: { left: 2 },
    archive: { left: [{ chapter: 5, section: 2, beatIds: [memoryBeat.id, beat.id] }], right: [] },
    ritual: { right: null, left: { from: 5, to: 5, contextTo: 3, startedAt: 1000, until: 3200, phase: "mask" } },
  });
  const first = render(<Game script={script} />);
  const archive = within(screen.getByTestId("terminal-archive"));
  expect(archive.getAllByText(/收录中…/).length).toBeGreaterThan(0);
  expect(archive.queryByText("加微信后")).toBeNull();
  expect(screen.queryByTestId("resetting-right")).toBeNull();
  act(() => vi.advanceTimersByTime(1100));
  first.unmount();
  render(<Game script={script} />);
  act(() => vi.advanceTimersByTime(1200));
  expect(screen.getByTestId("resetting-left")).toHaveTextContent("已清空");
  act(() => vi.advanceTimersByTime(2100));
  const current = within(screen.getByTestId("terminal-archive"));
  expect(current.getAllByText("加微信后")).toHaveLength(1);
  expect(current.queryByText("约见与表白")).toBeNull();
  const mark = current.getByText(`[MEM] ${memory.缩略标签}`);
  fireEvent.click(mark);
  expect(current.getByText(`「${memory.短句}」`)).toBeVisible();
  const stored = JSON.parse(localStorage.getItem("shuangxian.progress.v2")!).state as EngineState;
  expect(stored.archive?.left).toEqual([{ chapter: 5, section: 2, beatIds: [memoryBeat.id, beat.id] }]);
});

it("缩窗时整块画布等比缩小，大窗口保持原尺寸", () => {
  const ow = window.innerWidth;
  const oh = window.innerHeight;
  const resize = (width: number, height: number) => {
    window.innerWidth = width;
    window.innerHeight = height;
    fireEvent(window, new Event("resize"));
  };
  try {
    const script = loadBundledScript().script!;
    render(<Game script={script} />);
    const canvas = screen.getByTestId("game-canvas");
    const frame = canvas.parentElement!;
    for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]]) {
      resize(width, height);
      expect(parseFloat(frame.style.width) / parseFloat(frame.style.height)).toBeCloseTo(1440 / 920, 8);
      expect(parseFloat(frame.style.height)).toBeLessThanOrEqual(height);
    }
    expect(canvas.style.transform).toBe("scale(1)");
  } finally { resize(ow, oh); }
});

it("满槽时在 Context Store 换掉或舍弃同一用户的记忆", () => {
  const script = loadBundledScript().script!;
  const beat = script.beats.find(item => item.id === "5m.2.1")!;
  const memory = beat.记忆候选![0];
  const fixture = { ...script, beats: [beat], beatById: new Map([[beat.id, beat]]) };
  const old = Array.from({ length: 5 }, (_, index) => ({ label: `测试旧记忆${index}`, text: "旧原话", beatId: "L1" }));
  saveProgress({
    ...createInitial(fixture.beats),
    completed: [beat.id],
    chapter: { left: 5, right: 5 },
    messages: [{ id: "source", beatId: beat.id, channel: "left", from: "boy", text: memory.短句, delivery: "pop" }],
    memories: { left: old, right: [] },
  });
  render(<Game script={fixture} />);
  const left = within(screen.getByTestId("pane-left"));
  const archive = within(screen.getByTestId("terminal-archive"));
  fireEvent.click(archive.getByRole("button", { name: "USER 01 / 男生" }));
  fireEvent.click(left.getByRole("button", { name: `存记忆：${memory.短句}` }));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(archive.getByRole("button", { name: "替换「测试旧记忆0」" }));
  expect(left.getByTestId("memory-mark")).toHaveAttribute("data-saved", "true");
  fireEvent.click(archive.getByText("[MEMORY] 当前会话 · 5"));
  fireEvent.click(archive.getByText(`[MEM] ${memory.缩略标签}`));
  fireEvent.click(archive.getByRole("button", { name: `舍弃「${memory.缩略标签}」` }));
  expect(left.getByTestId("memory-counter-left")).toHaveTextContent("[MEM 4/5]");
});
