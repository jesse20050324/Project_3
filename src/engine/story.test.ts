import { describe, expect, it } from "vitest";
import chapterSource from "../../content/chapter-01.yaml?raw";
import { loadBundledScript } from "./loadScript";
import { choose, commitReply, createInitial, messagesFor } from "./scheduler";
import { drain } from "./testPlayback";

const l1Reply = [
  "帮你看了下，西安市中心的桌游店主要集中在小寨、钟楼和曲江这三个片区，选择挺多的。我按片区整理了几家口碑不错的，你们可以看哪个方便。",
  "",
  "时光桌游吧：位于小寨华旗国际A座，电话 029-85418760。是小寨片区比较老牌的桌游吧，但是环境一般，价格偏高。",
  "",
  "心动桌游俱乐部：在莱安中心T6-21703室。环境更新、店面更大，很多带独立包间，适合6人以上的大聚会。",
  "",
  "叙事者营地桌游馆：位于大唐不夜城长安C位10号商铺，位置在景区里，但公共交通相对没那么方便。",
].join("\n");

function shopReply(detail: string): string {
  return [
    "就选这家，别纠结了：",
    detail,
    "你们人稍微多，直接打电话说：“我们大概 X 个人，今天几点到，想要大桌或包间。”",
    "周五晚人多，最好现在就打，不然容易没位。",
    "如果这家没包间了，再跟我说，我马上给你换一家。",
  ].join("\n");
}

const makeupLine = "你说我要不要化妆，现在时间有点小紧张，但是好像有不认识的人来";
const makeupAside =
  "用户问要不要化妆：时间有点小紧张，但好像有不认识的人来。她有点想化，又怕来不及。需要给个明确建议，别让她纠结。两个方向都合理，看时间够不够。";
const makeupYes =
  "化吧，时间还够。简单上个底妆加口红就行，不用搞全套，半小时内能出门。有不认识的人在，气色好点自己也自在。";
const makeupNo = "不化也没事，桌游店光线一般，没人盯着看。洗把脸直接走，省下的时间路上还能歇会儿。";

describe("chapter 1", () => {
  it("loads only the lines the draft actually wrote", () => {
    const loaded = loadBundledScript();
    expect(loaded.error).toBeNull();
    const script = loaded.script!;
    expect(script.beats.map((beat) => beat.id)).toEqual([
      "L1",
      "L2",
      "L3",
      "L4-shiguang",
      "L4-xindong",
      "L4-xushi",
      "R1-shiguang",
      "R1-xindong",
      "R1-xushi",
      "R2",
    ]);
    const right = script.beats.filter((beat) => beat.channel === "right");
    expect(right.slice(0, 3).map((beat) => beat.requires)).toEqual([["L2"], ["L2"], ["L2"]]);
    expect(right.slice(0, 3).every((beat) => !beat.choices)).toBe(true);
    expect(right.slice(0, 3).map((beat) => beat.next)).toEqual(["R2", "R2", "R2"]);
    const makeup = right[3];
    expect(makeup.requires).toBeUndefined();
    expect(makeup.when).toBeUndefined();
    expect(makeup.next).toBeUndefined();
    expect(makeup.aside).toBe(makeupAside);
    expect(makeup.lines).toEqual([{ from: "girl", text: makeupLine, delivery: "type" }]);
    expect(makeup.choices?.map((choice) => choice.thought)).toEqual(["化", "不化"]);
    expect(makeup.choices?.map((choice) => choice.reply)).toEqual([makeupYes, makeupNo]);
    expect(makeup.choices?.every((choice) => choice.next === undefined && choice.set === undefined)).toBe(true);
    expect(chapterSource).not.toContain("行，到了跟我说");

    const [l1, l2, l3] = script.beats;
    expect(l1.lines[0].text).toBe("我朋友叫我去玩桌游，但是没定好去哪家，你帮我看一下，市中心有啥推荐的");
    expect(l1.lines[0].delivery).toBe("type");
    expect(l1.aside).toBe("用户想找市中心的桌游店推荐，我需要：");
    expect(l1.choices?.map((choice) => choice.thought)).toEqual(["搜索相关信息，并提供建议"]);
    expect(l1.choices?.[0].reply).toBe(l1Reply);
    expect(l1.choices?.[0].reply).not.toBe(l1.choices?.[0].thought);
    expect(l1.choices?.[0].next).toBe("L2");

    expect(l2.lines[0].text).toBe("你帮我选一下吧，你帮我选一个。我们可能人稍微多一点。我在收拾东西呢，没时间看。");
    expect(l2.aside).toContain("综合来看，最合适的是：");
    expect(l2.choices?.map((choice) => choice.thought)).toEqual(["时光桌游吧", "心动桌游俱乐部", "叙事者营地桌游馆"]);
    expect(l2.choices?.map((choice) => choice.next)).toEqual(["L3", "L3", "L3"]);
    expect(l2.choices?.[0].reply).toBe(
      shopReply("时光桌游吧，小寨华旗国际A座，电话 029-85418760。小寨老牌桌游吧，环境一般、价格偏高。"),
    );
    expect(l2.choices?.[1].reply).toBe(
      shopReply("心动桌游俱乐部，莱安中心T6-21703室，电话 029-85512345。环境新、店面大，带独立包间，适合6人以上大聚会。"),
    );
    expect(l2.choices?.[2].reply).toBe(
      shopReply("叙事者营地桌游馆，大唐不夜城长安C位10号商铺，电话 029-85678901。在景区里，有特色，但公共交通相对没那么方便。"),
    );
    expect(new Set(l2.choices?.map((choice) => choice.reply)).size).toBe(3);

    expect(l3.lines[0].text).toBe("OK");
    expect(l3.lines[0].delivery).toBe("pop");
    expect(l3.choices).toBeUndefined();
    expect(l3.next).toBeUndefined();

    const arrivals = script.beats.filter((beat) => beat.id.startsWith("L4-"));
    expect(arrivals.map((beat) => beat.requires)).toEqual([
      ["L3", "R2"],
      ["L3", "R2"],
      ["L3", "R2"],
    ]);
    expect(arrivals.map((beat) => beat.when)).toEqual([
      { shop: "时光桌游吧" },
      { shop: "心动桌游俱乐部" },
      { shop: "叙事者营地桌游馆" },
    ]);
    expect(arrivals.map((beat) => beat.lines[0].text)).toEqual([
      "我到桌游这了，换了个地方你选的那个他们说太贵了，除了我那个朋友其他人我都不认识好尴尬呀，而且好多女生",
      "我到桌游这了，除了我那个朋友其他人我都不认识好尴尬呀，而且好多女生",
      "我到桌游这了，换了个地方你选的那个他们说太远了，除了我那个朋友其他人我都不认识好尴尬呀，而且好多女生",
    ]);
    expect(new Set(arrivals.map((beat) => beat.aside)).size).toBe(1);
    expect(arrivals[0].aside).toBe(
      "用户到了桌游店，发现除了朋友谁都不认识，而且好多女生，觉得尴尬。他想缓解尴尬。两个方向：先刷手机避免眼神交流，或者主动找人攀谈。需要给具体可执行的做法。",
    );
    expect(arrivals.map((beat) => beat.choices)).toEqual([arrivals[0].choices, arrivals[0].choices, arrivals[0].choices]);
    expect(arrivals[0].choices?.map((choice) => choice.thought)).toEqual(["先刷手机，避免眼神交流", "主动找人攀谈"]);
    expect(arrivals[0].choices?.[0].reply).toBe(
      "先刷手机吧，坐下来别急着到处看，低头装忙最安全。等人齐开桌，玩起来就不尴尬了。记住别一直刷到不说话就行。",
    );
    expect(arrivals[0].choices?.[1].reply).toContain("你们平时玩啥桌游");
    expect(arrivals[0].choices?.every((choice) => choice.next === undefined && choice.set === undefined)).toBe(true);
  });

  it("plays the boy thread without showing the other shop replies or a girl thread", () => {
    const script = loadBundledScript().script!;
    let state = drain(createInitial(script.beats), "left", script.beats);
    expect(state.pending.left?.kind).toBe("choices");
    expect(messagesFor(state, "left").some((message) => message.text.includes("西安市中心"))).toBe(false);
    state = commitReply(choose(state, "left", 0, script.beats), "left", script.beats);
    state = drain(state, "left", script.beats);
    expect(state.pending.left?.kind).toBe("choices");
    state = commitReply(choose(state, "left", 0, script.beats), "left", script.beats);
    expect(state.flags.shop).toBe("时光桌游吧");
    const texts = messagesFor(state, "left").map((message) => message.text);
    expect(texts.some((text) => text.includes("小寨老牌桌游吧，环境一般、价格偏高"))).toBe(true);
    expect(texts.some((text) => text.includes("029-85512345"))).toBe(false);
    expect(texts.some((text) => text.includes("029-85678901"))).toBe(false);
    expect(texts.some((text) => text.includes("环境新、店面大"))).toBe(false);
    state = drain(state, "left", script.beats);
    const leftTexts = messagesFor(state, "left").map((message) => message.text);
    expect(leftTexts.at(-1)).toBe("OK");
    expect(leftTexts.some((text) => text.includes("我到桌游这了"))).toBe(false);
    expect(state.pending.left).toBeNull();
    expect(state.completed).toEqual(["L1", "L2", "L3"]);
    expect(messagesFor(state, "right")).toEqual([]);
    expect(state.pending.right).toBeNull();
  });

  it("opens only the arrival line for the chosen shop, then the same two ways to handle the room", () => {
    const beats = loadBundledScript().script!.beats;
    const phone = "先刷手机吧，坐下来别急着到处看，低头装忙最安全。等人齐开桌，玩起来就不尴尬了。记住别一直刷到不说话就行。";
    const talk = "那就主动点，别干坐着。看到面善的，上去问一句 \"你们平时玩啥桌游\"，从游戏聊开最自然。好多女生也别慌，当普通牌友就行。";
    const cases = [
      { index: 0, beat: "L4-shiguang", mark: "太贵了", absent: "太远了" },
      { index: 1, beat: "L4-xindong", mark: "我到桌游这了，除了我那个朋友", absent: "换了个地方" },
      { index: 2, beat: "L4-xushi", mark: "太远了", absent: "太贵了" },
    ];

    for (const item of cases) {
      let state = drain(createInitial(beats), "left", beats);
      state = commitReply(choose(state, "left", 0, beats), "left", beats);
      state = drain(state, "left", beats);
      state = commitReply(choose(state, "left", item.index, beats), "left", beats);
      state = drain(state, "left", beats);
      expect(messagesFor(state, "left").at(-1)?.text).toBe("OK");
      expect(state.pending.left).toBeNull();
      state = drain(state, "right", beats);
      expect(state.pending.right?.kind).toBe("choices");
      state = commitReply(choose(state, "right", 0, beats), "right", beats);
      expect(state.completed).toContain("R2");
      state = drain(state, "left", beats);
      const arrival = messagesFor(state, "left").at(-1)?.text ?? "";
      expect(state.pending.left).toEqual({ kind: "choices", beatId: item.beat });
      expect(arrival).toContain(item.mark);
      expect(arrival).not.toContain(item.absent);
      const phoneState = commitReply(choose(state, "left", 0, beats), "left", beats);
      const phoneTexts = messagesFor(phoneState, "left").map((message) => message.text);
      expect(phoneTexts).toContain(phone);
      expect(phoneTexts).not.toContain(talk);
      expect(phoneState.pending.left).toBeNull();
      const talkState = commitReply(choose(state, "left", 1, beats), "left", beats);
      const talkTexts = messagesFor(talkState, "left").map((message) => message.text);
      expect(talkTexts).toContain(talk);
      expect(talkTexts).not.toContain(phone);
    }
  });

  it("opens the girl thread for the chosen shop only, then the same makeup question", () => {
    const script = loadBundledScript().script!;
    const beats = script.beats;
    const before = createInitial(beats);
    expect(messagesFor(before, "right")).toEqual([]);
    expect(before.pending.right).toBeNull();

    const cases = [
      {
        index: 0,
        shop: "时光桌游吧",
        beat: "R1-shiguang",
        place: "小寨华旗国际 A 座",
        reaction: "这个太贵了吧，我让他换个地方",
        absent: "莱安中心 T6-21703",
      },
      {
        index: 1,
        shop: "心动桌游俱乐部",
        beat: "R1-xindong",
        place: "莱安中心 T6-21703 室",
        reaction: "OK，这个感觉还挺好的",
        absent: "大唐不夜城长安 C 位",
      },
      {
        index: 2,
        shop: "叙事者营地桌游馆",
        beat: "R1-xushi",
        place: "大唐不夜城长安 C 位 10 号商铺",
        reaction: "咋这么远，过去都啥时候了，我让他换个地方",
        absent: "小寨华旗国际 A 座",
      },
    ];

    for (const item of cases) {
      let state = drain(createInitial(beats), "left", beats);
      state = commitReply(choose(state, "left", 0, beats), "left", beats);
      state = drain(state, "left", beats);
      expect(messagesFor(state, "right")).toEqual([]);
      state = commitReply(choose(state, "left", item.index, beats), "left", beats);
      expect(state.flags.shop).toBe(item.shop);
      state = drain(state, "right", beats);
      const texts = messagesFor(state, "right").map((message) => message.text);
      expect(state.completed).toContain(item.beat);
      expect(texts[0]).toContain(item.shop);
      expect(texts[0]).toContain("我刚起床还没洗脸");
      expect(texts[1]).toContain("不要啰嗦");
      expect(messagesFor(state, "right")[1]?.delivery).toBe("thought");
      expect(texts[2]).toContain(item.place);
      expect(texts[3]).toBe(item.reaction);
      expect(texts[4]).toBe(makeupLine);
      expect(texts).not.toContain(makeupAside);
      expect(texts.some((text) => text.includes(item.absent))).toBe(false);
      expect(state.pending.right).toEqual({ kind: "choices", beatId: "R2" });
      expect(state.completed).not.toContain("R2");

      const yes = commitReply(choose(state, "right", 0, beats), "right", beats);
      const yesTexts = messagesFor(yes, "right").map((message) => message.text);
      expect(yesTexts.at(-1)).toBe(makeupYes);
      expect(yesTexts).not.toContain(makeupNo);
      expect(yesTexts.some((text) => text === "化")).toBe(false);
      expect(yesTexts.some((text) => text.includes(item.absent))).toBe(false);
      expect(yes.pending.right).toBeNull();
      expect(yes.completed).toContain("R2");
      expect(yes.flags).toEqual({ shop: item.shop });

      const no = commitReply(choose(state, "right", 1, beats), "right", beats);
      const noTexts = messagesFor(no, "right").map((message) => message.text);
      expect(noTexts.at(-1)).toBe(makeupNo);
      expect(noTexts).not.toContain(makeupYes);
      expect(noTexts.some((text) => text === "不化")).toBe(false);
      expect(noTexts.some((text) => text.includes(item.absent))).toBe(false);
      expect(no.pending.right).toBeNull();
      expect(no.completed).toContain("R2");
      expect(no.flags).toEqual({ shop: item.shop });
    }
  });
});
