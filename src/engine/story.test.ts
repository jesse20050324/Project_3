import { describe, expect, it } from "vitest";
import { loadBundledScript, parseScript } from "./loadScript";
import { validateScript } from "./validate";

describe("CH1-CH5 剧本契约", () => {
  const { script, error } = loadBundledScript();

  it("各章都能通过严格解析与启动校验", () => {
    expect(error).toBeNull();
    expect(script).not.toBeNull();
  });

  it("章号为 1/3/4/5/6/7/8，第五章 40 拍、16 档时间轴", () => {
    if (!script) throw new Error("剧本没有加载");
    const chapters = [...new Set(script.beats.map((beat) => beat.chapter))];
    expect(chapters).toEqual([1, 3, 4, 5, 6, 7, 8]);
    expect(script.beats.filter((beat) => beat.chapter === 5)).toHaveLength(40);
    expect(script.axes?.[5]).toHaveLength(16);
  });

  it("第五章的 6 处真分叉、8 个区间拍、6 个入场变体、2 个终局拍都在", () => {
    if (!script) throw new Error("剧本没有加载");
    const ch5 = script.beats.filter((beat) => beat.chapter === 5);
    const forks = ch5.filter((beat) => new Set((beat.choices ?? []).map((choice) => choice.next)).size > 1);
    expect(forks).toHaveLength(6);
    expect(ch5.filter((beat) => beat.window)).toHaveLength(8);
    expect(ch5.filter((beat) => beat.when)).toHaveLength(6);
    expect(ch5.filter((beat) => beat.ending === "在一起")).toHaveLength(2);
    expect(script.endings?.map((ending) => ending.id)).toContain("在一起");
  });

  it("等待门全部指向男线的共享拍，且都在本拍之前", () => {
    if (!script) throw new Error("剧本没有加载");
    const byId = script.beatById!;
    const waits = script.beats.filter((beat) => beat.chapter === 5 && beat.requires);
    expect(waits).toHaveLength(9);
    for (const beat of waits) {
      for (const id of beat.requires ?? []) {
        expect(id.startsWith("5m.")).toBe(true);
        expect(byId.has(id)).toBe(true);
        expect(byId.get(id)!.sortKey).toBeLessThan(beat.sortKey!);
      }
    }
  });

  it("定稿的世界事实逐字落地", () => {
    if (!script) throw new Error("剧本没有加载");
    const all = script.beats.flatMap((beat) => [
      ...beat.lines.map((line) => line.text),
      ...(beat.choices ?? []).map((choice) => choice.reply),
    ]).join("\n");
    expect(all).toContain("上次桌游坐你旁边的，还记得我不？");
    expect(all).toContain("行，周日，你忙你的");
    expect(all).toContain("我也想试试，只是我可能不太会谈恋爱");
    expect(all).not.toContain("特冷的笑话");
    expect(all).not.toContain("就五个字");
  });

  it("幕5 每窗 3 条候选，保留原文但撤下两条纯占候选", () => {
    if (!script) throw new Error("剧本没有加载");
    const candidates = script.beats
      .filter((beat) => beat.chapter === 5)
      .flatMap((beat) => beat.记忆候选 ?? []);
    expect(candidates).toHaveLength(6);
    expect(candidates.map(candidate => candidate.缩略标签)).not.toContain("猫叫煤球");
    expect(candidates.map(candidate => candidate.缩略标签)).not.toContain("头像是小熊");
    for (const candidate of candidates) {
      expect(["Ta的真实", "对Ta的美化", "干扰项", "自己的真实", "自我的美化"]).toContain(candidate.类型);
    }
  });

  it("旧章没有时间轴时按文件顺序补排序键，播放顺序不回退", () => {
    if (!script) throw new Error("剧本没有加载");
    for (const chapter of [1, 3, 4]) {
      const beats = script.beats.filter((beat) => beat.chapter === chapter);
      const keys = beats.map((beat) => beat.sortKey!);
      expect([...keys]).toEqual([...keys].sort((a, b) => a - b));
    }
  });

  it("未知字段会被严格拒绝，不再静默丢弃", () => {
    expect(() => parseScript([
      "title: 测试",
      "speakers:",
      "  - id: boy",
      "    name: 男生",
      "    channel: left",
      "beats:",
      "  - id: X1",
      "    channel: left",
      "    剧本新加的字段: 值",
      "    lines:",
      "      - from: boy",
      "        text: 你好",
      "        delivery: pop",
    ].join("\n"))).toThrow(/不认识的字段/);
  });

  it("区间门的端点不合法时启动校验会报错", () => {
    if (!script) throw new Error("剧本没有加载");
    const beats = script.beats.map((beat) => ({ ...beat }));
    const windowed = beats.find((beat) => beat.window)!;
    windowed.window = { ...windowed.window!, 上界: ["不存在的拍"] };
    const result = validateScript({ ...script, beats });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("不存在");
  });
});
