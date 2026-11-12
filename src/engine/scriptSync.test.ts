import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "js-yaml";
import { describe, expect, it } from "vitest";
import { loadBundledScript } from "./loadScript";

/**
 * 防漂移：第五幕上线定稿↔ 实现层 content/chapter-05.yaml。
 * 历史上第五章掉队就是因为这条链没有机器校验，v5.1 定稿了而引擎还在播 v3。
 */
type Turn = {
  编号: string; 所属: string; 时间: string; 用户消息: string; AI思考: string;
  选项: string[]; AI回复: string | string[]; 等待?: string; 入场?: string;
  终局?: string; 分叉?: Record<string, string>; 下一?: string;
};
type Source = { 时间轴?: string[]; 轮次?: Turn[] };
type Engine = {
  时间轴?: string[];
  beats?: Array<{
    id: string; time?: string; requires?: string[]; when?: Record<string, string>;
    ending?: string; window?: unknown;
    lines: Array<{ text: string; delivery: string; timing?: unknown }>;
    choices?: Array<{ thought: string; reply: string; next?: string }>;
    记忆候选?: Array<{ 短句: string }>;
  }>;
};

const root = process.cwd();
const source = YAML.load(readFileSync(resolve(root, "docs/剧本审稿/第五幕-上线定稿.yaml"), "utf8")) as Source;
const engine = YAML.load(readFileSync(resolve(root, "content/chapter-05.yaml"), "utf8")) as Engine;
const byId = new Map((engine.beats ?? []).map((beat) => [beat.id, beat]));

it("第六、七幕生成物和已校验审稿源保持同步", () => {
  expect(() => execFileSync(process.execPath, ["tools/build-later-chapters.mjs", "--check"], {
    cwd: root,
    encoding: "utf8",
  })).not.toThrow();
});

function idOf(turn: Turn): string {
  return `${turn.所属 === "男生" ? "5m" : "5f"}.${turn.编号.slice(2)}`;
}

describe("第五章上线定稿 ↔ 引擎实现层", () => {
  it("生成器的 --check 通过（生成物没有漂移）", () => {
    const output = execFileSync(process.execPath, ["tools/build-chapter.mjs", "--check"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(output).toContain("同步校验通过");
  });

  it("时间轴与拍数逐项对齐", () => {
    expect(engine.时间轴).toEqual(source.时间轴);
    expect(engine.beats).toHaveLength(source.轮次?.length ?? 0);
    expect(source.轮次).toHaveLength(40);
    expect(source.时间轴).toHaveLength(16);
  });

  it("每拍的 ①用户消息 / ②AI思考 / ③选项 / ④AI回复 与定稿逐字一致", () => {
    for (const turn of source.轮次 ?? []) {
      const beat = byId.get(idOf(turn));
      expect(beat, `缺少 ${idOf(turn)}`).toBeDefined();
      if (!beat) continue;
      expect(beat.lines[0].text, `${beat.id} ①`).toBe(turn.用户消息);
      expect(beat.lines[1].text, `${beat.id} ②`).toBe(turn.AI思考);
      const options = Array.isArray(turn.选项) ? turn.选项 : [turn.选项];
      const replies = Array.isArray(turn.AI回复) ? turn.AI回复 : [turn.AI回复];
      expect(beat.choices).toHaveLength(options.length);
      options.forEach((thought, index) => {
        expect(beat.choices?.[index].thought, `${beat.id} ③-${index}`).toBe(thought);
        expect(beat.choices?.[index].reply, `${beat.id} ④-${index}`).toBe(replies[index]);
      });
    }
  });

  it("时间档、等待门、入场旗标、终局都从定稿落到了实现层", () => {
    let waits = 0;
    let endings = 0;
    for (const turn of source.轮次 ?? []) {
      const beat = byId.get(idOf(turn));
      if (!beat) throw new Error(`缺少 ${idOf(turn)}`);
      expect(beat.time, `${beat.id} time`).toBe(turn.时间);
      if (turn.等待) {
        waits += 1;
        const owner = turn.等待.startsWith("男生") ? "5m" : "5f";
        const number = turn.等待.replace(/^(男生|女生)/, "");
        expect(beat.requires, `${beat.id} 等待门`).toEqual([`${owner}.${number.slice(2)}`]);
      }
      if (turn.入场) expect(beat.when, `${beat.id} 入场旗标`).toBeDefined();
      if (turn.终局) {
        endings += 1;
        expect(beat.ending, `${beat.id} 终局`).toBe("在一起");
      }
    }
    expect(waits).toBe(9);
    expect(endings).toBe(2);
  });

  it("跨窗区间覆盖 11 拍，女方收到表白的拍允许旧存档继续", () => {
    const windowed = (engine.beats ?? []).filter((beat) => beat.window);
    expect(windowed).toHaveLength(11);
    for (const beat of windowed) {
      const gate = beat.window as { 下界: string[]; 上界: string[] };
      if (beat.id === "5f.4.1") {
        expect(gate.下界).toEqual(["5m.4.2", "5m.4.3"]);
        expect(gate.上界).toEqual([]);
      } else {
        expect(gate.上界.length).toBeGreaterThan(0);
      }
      expect(gate.下界.length).toBeGreaterThan(0);
    }
  });

  it("每条消息经 loadScript 后都带上了定值 Timing", () => {
    const { script, error } = loadBundledScript();
    expect(error).toBeNull();
    if (!script) throw new Error("剧本没有加载");
    for (const beat of script.beats) {
      for (const line of beat.lines) {
        expect(line.timing, `${beat.id} 的台词没有解析出 timing`).toBeDefined();
        expect(line.timing?.typeIntervalMs).toBeGreaterThan(0);
      }
      for (const choice of beat.choices ?? []) expect(choice.timing).toBeDefined();
    }
  });

  it("v3 旧文案已从实现层清除", () => {
    const raw = readFileSync(resolve(root, "content/chapter-05.yaml"), "utf8");
    expect(raw).not.toContain("特冷的笑话");
    expect(raw).not.toContain("就五个字");
    expect(raw).not.toContain("轮次设计稿 v3");
  });
});
