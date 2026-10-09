import { describe, expect, it } from "vitest";
import {
  availableBeat,
  channelView,
  choose,
  commitLine,
  commitReply,
  createInitial,
  deliveryAnimates,
  describeChannel,
  messagesFor,
  openChannel,
} from "./scheduler";
import type { Beat, Channel, EngineState } from "./types";
import { validateScript } from "./validate";
import type { Script } from "./types";

const cast = [
  { id: "boy", name: "男生", channel: "left" as const },
  { id: "girl", name: "女生", channel: "right" as const },
  { id: "ai", name: "AI" },
];

function line(id: string, channel: Channel, text: string, next?: string, delivery: Beat["lines"][number]["delivery"] = "pop"): Beat {
  return {
    id,
    channel,
    next,
    lines: [{ from: channel === "left" ? "boy" : "girl", text, delivery }],
  };
}

function drain(state: EngineState, channel: Channel, beats: Beat[]): EngineState {
  let current = openChannel(state, channel, beats);
  for (let step = 0; step < 40; step += 1) {
    const pending = current.pending[channel];
    if (!pending || pending.kind === "choices") return current;
    current = pending.kind === "reply" ? commitReply(current, channel, beats) : commitLine(current, channel, beats);
    if (!current.pending[channel]) {
      const opened = openChannel(current, channel, beats);
      if (opened === current) return current;
      current = opened;
    }
  }
  throw new Error("步数过多，可能有环");
}

describe("scheduler", () => {
  it("keeps type and pop as different deliveries and stores the full line", () => {
    const beats: Beat[] = [
      {
        id: "L1",
        channel: "left",
        lines: [
          { from: "boy", text: "慢慢说完", delivery: "type" },
          { from: "boy", text: "一下子出现", delivery: "pop" },
        ],
      },
    ];
    const state = drain(createInitial(beats), "left", beats);
    const messages = messagesFor(state, "left");
    expect(messages.map((message) => message.delivery)).toEqual(["type", "pop"]);
    expect(messages.map((message) => message.text)).toEqual(["慢慢说完", "一下子出现"]);
    expect(deliveryAnimates("type")).toBe(true);
    expect(deliveryAnimates("pop")).toBe(false);
  });

  it("sends the fixed reply instead of the thought and sets a flag", () => {
    const beats: Beat[] = [
      {
        id: "L1",
        channel: "left",
        lines: [{ from: "boy", text: "他是不是喜欢我", delivery: "pop" }],
        choices: [
          { thought: "客观分析", reply: "从你描述的互动来看，他还在观察。", set: { tone: "objective", trust: 1 }, next: "L2" },
          { thought: "顺着他说", reply: "听起来他挺在意你的。", set: { tone: "agree" }, next: "L2" },
        ],
      },
      line("L2", "left", "下一句"),
    ];
    let state = drain(createInitial(beats), "left", beats);
    expect(state.pending.left?.kind).toBe("choices");
    expect(() => choose(openChannel(createInitial(beats), "left", beats), "left", 0, beats)).toThrow(/还不能选/);
    expect(messagesFor(state, "left").some((message) => message.text === "客观分析")).toBe(false);
    state = choose(state, "left", 0, beats);
    state = commitReply(state, "left", beats);
    const sent = messagesFor(state, "left").at(-1);
    expect(sent?.from).toBe("ai");
    expect(sent?.text).toBe("从你描述的互动来看，他还在观察。");
    expect(sent?.text).not.toBe("客观分析");
    expect(state.flags).toEqual({ tone: "objective", trust: 1 });
  });

  it("lets one channel move through several beats while the other stays put", () => {
    const beats = [line("L1", "left", "一", "L2"), line("L2", "left", "二", "L3"), line("L3", "left", "三"), line("R1", "right", "右一")];
    const state = drain(createInitial(beats), "left", beats);
    expect(state.completed).toEqual(["L1", "L2", "L3"]);
    expect(messagesFor(state, "left").map((message) => message.text)).toEqual(["一", "二", "三"]);
    expect(messagesFor(state, "right")).toEqual([]);
    expect(state.completed).not.toContain("R1");
    expect(state.pending.right).toBeNull();
    expect(availableBeat(state, "right", beats)?.id).toBe("R1");
    const both = drain(state, "right", beats);
    expect(messagesFor(both, "right").map((message) => message.text)).toEqual(["右一"]);
    expect(messagesFor(both, "left").every((message) => message.channel === "left")).toBe(true);
    expect(messagesFor(both, "right").every((message) => message.channel === "right")).toBe(true);
  });

  it("plays only the branch whose flag matches and leaves the other lines unsent", () => {
    const beats: Beat[] = [
      {
        id: "L2",
        channel: "left",
        lines: [{ from: "boy", text: "选店", delivery: "pop" }],
        choices: [
          { thought: "甲", reply: "选甲", set: { shop: "甲" } },
          { thought: "乙", reply: "选乙", set: { shop: "乙" } },
        ],
      },
      {
        id: "Ra",
        channel: "right",
        requires: ["L2"],
        when: { shop: "甲" },
        lines: [{ from: "girl", text: "甲店太贵", delivery: "pop" }],
      },
      {
        id: "Rb",
        channel: "right",
        requires: ["L2"],
        when: { shop: "乙" },
        lines: [{ from: "girl", text: "乙店挺好", delivery: "pop" }],
      },
    ];
    const waiting = createInitial(beats);
    expect(channelView(waiting, "right", beats).mode).toBe("gated");
    expect(messagesFor(waiting, "right")).toEqual([]);
    let state = drain(waiting, "left", beats);
    state = commitReply(choose(state, "left", 0, beats), "left", beats);
    state = drain(state, "right", beats);
    expect(messagesFor(state, "right").map((message) => message.text)).toEqual(["甲店太贵"]);
    expect(state.completed).not.toContain("Rb");
    expect(messagesFor(state, "right").some((message) => message.text.includes("乙店"))).toBe(false);
  });

  it("holds a beat until every required beat is done and does not reveal its line", () => {
    const secret = "闸门后面的那句不该出现";
    const beats: Beat[] = [
      line("L1", "left", "先说完这边"),
      { id: "R1", channel: "right", requires: ["L1"], lines: [{ from: "girl", text: secret, delivery: "type" }] },
    ];
    const initial = createInitial(beats);
    expect(availableBeat(initial, "right", beats)).toBeNull();
    expect(channelView(initial, "right", beats).mode).toBe("gated");
    expect(messagesFor(initial, "right")).toEqual([]);
    const described = describeChannel(initial, "right", beats);
    expect(described).toContain("R1");
    expect(described).toContain("L1");
    expect(described).not.toContain(secret);
    const afterLeft = drain(initial, "left", beats);
    expect(messagesFor(afterLeft, "right")).toEqual([]);
    expect(availableBeat(afterLeft, "right", beats)?.id).toBe("R1");
    const afterRight = drain(afterLeft, "right", beats);
    expect(messagesFor(afterRight, "right").map((message) => message.text)).toEqual([secret]);
  });

  it("sends one choice down one next beat and the other choice down another", () => {
    const beats: Beat[] = [
      {
        id: "L1",
        channel: "left",
        lines: [{ from: "boy", text: "问", delivery: "pop" }],
        choices: [
          { thought: "冷一点", reply: "冷回复", set: { mood: "cold" }, next: "L2" },
          { thought: "热一点", reply: "热回复", set: { mood: "warm" }, next: "L3" },
        ],
      },
      line("L2", "left", "冷线"),
      line("L3", "left", "热线"),
    ];
    const cold = continueAfter(beats, 0);
    expect(messagesFor(cold, "left").map((message) => message.text)).toEqual(["问", "冷回复", "冷线"]);
    expect(cold.completed).toEqual(["L1", "L2"]);
    expect(cold.flags.mood).toBe("cold");
    expect(cold.activated).not.toContain("L3");

    const warm = continueAfter(beats, 1);
    expect(messagesFor(warm, "left").map((message) => message.text)).toEqual(["问", "热回复", "热线"]);
    expect(warm.completed).toEqual(["L1", "L3"]);
    expect(warm.activated).not.toContain("L2");
  });

  it("keeps an image line intact for the bubble to render", () => {
    const beats: Beat[] = [
      {
        id: "L1",
        channel: "left",
        lines: [{ from: "boy", text: "/cards/note.png", delivery: "image", caption: "一张纸条" }],
      },
    ];
    const state = drain(createInitial(beats), "left", beats);
    const message = messagesFor(state, "left")[0];
    expect(message.delivery).toBe("image");
    expect(message.text).toBe("/cards/note.png");
    expect(message.caption).toBe("一张纸条");
    expect(deliveryAnimates("image")).toBe(false);
  });
});

describe("validateScript", () => {
  it("fails a cyclic requires graph with a clear error", () => {
    const script: Script = {
      title: "环",
      speakers: cast,
      beats: [
        { id: "A", channel: "left", requires: ["B"], lines: [{ from: "boy", text: "甲", delivery: "pop" }] },
        { id: "B", channel: "left", requires: ["A"], lines: [{ from: "boy", text: "乙", delivery: "pop" }] },
      ],
    };
    const result = validateScript(script);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("成环");
      expect(result.error).toContain("A");
      expect(result.error).toContain("B");
      expect(result.error).toContain("不能开始");
    }
  });

  it("rejects a next pointer that jumps to the other channel", () => {
    const script: Script = {
      title: "串侧",
      speakers: cast,
      beats: [
        { id: "L1", channel: "left", next: "R1", lines: [{ from: "boy", text: "左", delivery: "pop" }] },
        { id: "R1", channel: "right", lines: [{ from: "girl", text: "右", delivery: "pop" }] },
      ],
    };
    const result = validateScript(script);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("另一侧");
  });
});

function continueAfter(beats: Beat[], index: number): EngineState {
  let state = drain(createInitial(beats), "left", beats);
  state = choose(state, "left", index, beats);
  state = commitReply(state, "left", beats);
  return drain(state, "left", beats);
}
