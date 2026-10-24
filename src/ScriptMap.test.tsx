import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { loadBundledScript } from "./engine/loadScript";
import { sequenceBoard, storyFlow, ScriptMap, type FlowRow } from "./ScriptMap";

function forks(rows: FlowRow[]) {
  return rows.filter((row) => row.type === "fork");
}

describe("story flow", () => {
  const loaded = loadBundledScript();
  const script = loaded.script!;
  const chapters = storyFlow(script);
  const boy = chapters.find((chapter) => chapter.channel === "left")!;
  const girl = chapters.find((chapter) => chapter.channel === "right")!;

  it("splits and rejoins by flag instead of keeping shops as columns", () => {
    const girlForks = forks(girl.rows);
    expect(girlForks).toHaveLength(1);
    expect(girlForks[0].title).toContain("shop");
    expect(girlForks[0].title).toContain("L2");
    expect(girlForks[0].nodes.map((node) => node.flag)).toEqual([
      "shop = 时光桌游吧",
      "shop = 心动桌游俱乐部",
      "shop = 叙事者营地桌游馆",
    ]);
    expect(girlForks[0].nodes.map((node) => node.difference)).toEqual(["这个太贵了吧", "这个感觉还挺好的", "咋这么远"]);
    expect(girl.rows.some((row) => row.type === "join")).toBe(true);
    expect(girl.rows.some((row) => row.type === "node" && row.node.id === "R2")).toBe(true);
    expect(girl.rows.some((row) => row.type === "ends" && row.labels.some((label) => label.startsWith("化")))).toBe(true);

    const boyForks = forks(boy.rows);
    expect(boyForks).toHaveLength(1);
    expect(boyForks[0].nodes.every((node) => node.id.startsWith("L4"))).toBe(true);
    expect(boy.rows.some((row) => row.type === "node" && row.node.id === "L3")).toBe(true);
    expect(boyForks[0].nodes.map((node) => node.difference)).toContain("没说「换了个地方」");
    expect(boyForks[0].nodes.map((node) => node.difference).join(" ")).toMatch(/太贵/);
    expect(boyForks[0].nodes.map((node) => node.difference).join(" ")).toMatch(/太远/);
  });

  it("orders beats left to right by what they wait for", () => {
    const board = sequenceBoard(script);
    const at = board.columnOf;
    expect(at("L1")).toBeLessThan(at("L2"));
    expect(at("L2")).toBeLessThan(at("L3"));
    expect(at("L2")).toBeLessThan(at("R1-shiguang"));
    expect(at("L3")).toBe(at("R1-xindong"));
    expect(at("R1-shiguang")).toBeLessThan(at("R2"));
    expect(at("R2")).toBeLessThan(at("L4-shiguang"));
    expect(at("L3")).toBeLessThan(at("L4-xushi"));
    const boyLane = board.lanes.find((lane) => lane.channel === "left");
    expect(boyLane?.cells.some((cell) => cell?.chapterLabel === "第二幕 · 桌游店")).toBe(true);
    const girlLane = board.lanes.find((lane) => lane.channel === "right");
    expect(girlLane?.cells.some((cell) => cell?.chapterLabel)).toBe(false);
  });

  it("hides the full lines until a node is opened", () => {
    render(<ScriptMap script={script} />);
    const girl = screen.getByTestId("flow-right");

    expect(screen.queryByText(/帮你看了下/)).toBeNull();
    expect(within(girl).getByText("「这个太贵了吧」")).toBeTruthy();
    expect(within(girl).getByText("shop = 时光桌游吧")).toBeTruthy();
    expect(within(girl).getByText("合回来")).toBeTruthy();

    fireEvent.click(screen.getByTestId("node-R1-shiguang"));
    expect(screen.getByText("这个太贵了吧，我让他换个地方")).toBeTruthy();

    fireEvent.click(screen.getByTestId("node-L1"));
    expect(screen.getByText(/帮你看了下/)).toBeTruthy();
  });
});
