import { describe, expect, it } from "vitest";
import chapterSource from "../../content/chapter-01.yaml?raw";
import { loadBundledScript } from "./loadScript";
import { canArm, availableBeat, choose, clearChannelMessages, commitReply, createInitial, messagesFor, openChannel, saveMemory } from "./scheduler";
import { drain } from "./testPlayback";
import type { Beat, Channel, EngineState, Scalar } from "./types";
import { validateScript } from "./validate";

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
      "R1-shiguang",
      "R1-xindong",
      "R1-xushi",
      "R2",
      "3.1.1-A",
      "3.1.1-B",
      "3.1.1-C",
      "3.2.1",
      "3.2.2",
      "3.2.3",
      "3.2.4",
      "3.3.1",
      "3.3.2",
      "3.4.1",
      "3.4.2",
      "3.4.3-A",
      "3.4.3-B",
      "3.4.4",
      "4.1.1",
      "4.2.1",
      "4.2.2",
      "4.2.3",
      "4.2.4",
      "4.2.5",
      "4.3.1",
      "4.3.2",
      "4.3.3",
      "4.3.4",
      "4.3.5",
      "5m.1.1-A",
      "5m.1.1-B",
      "5m.1.1-C",
      "5m.1.11",
      "5m.1.111",
      "5m.1.1111",
      "5m.2.1",
      "5m.2.11",
      "5m.2.111",
      "5m.3.1",
      "5m.4.1",
      "5m.4.11",
      "5f.1.1-A",
      "5f.1.1-B",
      "5f.1.1-C",
      "5f.1.11",
      "5f.1.111",
      "5f.1.1111",
      "5f.2.1",
      "5f.2.11",
      "5f.2.111",
      "5f.3.1",
      "5f.4.1",
      "5f.4.11",
    ]);
    expect(script.beats.filter((beat) => beat.chapter === 1).map((beat) => beat.id)).toEqual([
      "L1",
      "L2",
      "L3",
      "R1-shiguang",
      "R1-xindong",
      "R1-xushi",
      "R2",
    ]);
    expect(script.beats.filter((beat) => beat.chapter === 3).map((beat) => beat.id)).toEqual([
      "3.1.1-A",
      "3.1.1-B",
      "3.1.1-C",
      "3.2.1",
      "3.2.2",
      "3.2.3",
      "3.2.4",
      "3.3.1",
      "3.3.2",
      "3.4.1",
      "3.4.2",
      "3.4.3-A",
      "3.4.3-B",
      "3.4.4",
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
    expect(makeup.choices?.every((choice) => choice.next === undefined)).toBe(true);
    expect(makeup.choices?.map((choice) => choice.set)).toEqual([{ 化妆: "化" }, { 化妆: "不化" }]);
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

    const arrivals = script.beats.filter((beat) => beat.id.startsWith("3.1.1-"));
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
    expect(arrivals.every((beat) => beat.记忆候选 === undefined && beat.aside === undefined)).toBe(true);
    expect(arrivals.map((beat) => beat.choices)).toEqual([arrivals[0].choices, arrivals[0].choices, arrivals[0].choices]);
    expect(arrivals[0].choices?.map((choice) => choice.thought)).toEqual(["先刷手机，避免眼神交流", "主动找人攀谈"]);
    expect(arrivals[0].choices?.[0].reply).toBe(
      "先刷手机吧，坐下来别急着到处看，低头装忙最安全。等人齐开桌，玩起来就不尴尬了。记住别一直刷到不说话就行。",
    );
    expect(arrivals[0].choices?.[1].reply).toContain("你们平时玩啥桌游");
    expect(arrivals[0].choices?.map((choice) => choice.next)).toEqual(["3.3.1", "3.2.1"]);
    expect(arrivals[0].choices?.map((choice) => choice.set)).toEqual([
      { 路线: "刷手机", 到店: true },
      { 路线: "攀谈", 到店: true },
    ]);
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
      { index: 0, beat: "3.1.1-A", mark: "太贵了", absent: "太远了" },
      { index: 1, beat: "3.1.1-B", mark: "我到桌游这了，除了我那个朋友", absent: "换了个地方" },
      { index: 2, beat: "3.1.1-C", mark: "太远了", absent: "太贵了" },
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
      // 到店拍现在是两行：①男生台词 + ②AI思考，台词在倒数第二行
      const arrival = messagesFor(state, "left").at(-2)?.text ?? "";
      expect(state.pending.left).toEqual({ kind: "choices", beatId: item.beat });
      expect(arrival).toContain(item.mark);
      expect(arrival).not.toContain(item.absent);
      const phoneState = commitReply(choose(state, "left", 0, beats), "left", beats);
      const phoneTexts = messagesFor(phoneState, "left").map((message) => message.text);
      expect(phoneTexts).toContain(phone);
      expect(phoneTexts).not.toContain(talk);
      // 玩手机线：看到女生那拍要等女生确认完地址（3.3.1 requires 3.4.1），男生先停住
      expect(phoneState.pending.left).toBeNull();
      expect(phoneState.flags.路线).toBe("刷手机");
      expect(phoneState.flags.到店).toBe(true);
      const talkState = commitReply(choose(state, "left", 1, beats), "left", beats);
      const talkTexts = messagesFor(talkState, "left").map((message) => message.text);
      expect(talkTexts).toContain(talk);
      expect(talkTexts).not.toContain(phone);
      expect(talkState.pending.left).toEqual({ kind: "lines", beatId: "3.2.1", lineIndex: 0 });
      expect(talkState.flags.路线).toBe("攀谈");
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
      expect(texts[3]).toContain("你帮我记一下");
      expect(texts[4]).toBe(item.reaction);
      expect(texts[5]).toBe(makeupLine);
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
      expect(yes.flags).toEqual({ shop: item.shop, 化妆: "化" });

      const no = commitReply(choose(state, "right", 1, beats), "right", beats);
      const noTexts = messagesFor(no, "right").map((message) => message.text);
      expect(noTexts.at(-1)).toBe(makeupNo);
      expect(noTexts).not.toContain(makeupYes);
      expect(noTexts.some((text) => text === "不化")).toBe(false);
      expect(noTexts.some((text) => text.includes(item.absent))).toBe(false);
      expect(no.pending.right).toBeNull();
      expect(no.completed).toContain("R2");
      expect(no.flags).toEqual({ shop: item.shop, 化妆: "不化" });
    }
  });
});

describe("memory system", () => {
  const beats = loadBundledScript().script!.beats;

  it("ships tutorial candidates and gates that reference them", () => {
    const labels = (id: string) =>
      (beats.find((beat) => beat.id === id)?.记忆候选 ?? []).map((candidate) => candidate.缩略标签);
    expect(labels("R1-shiguang")).toEqual(["店的位置"]);
    expect(labels("R1-xindong")).toEqual(["店的位置"]);
    expect(labels("R1-xushi")).toEqual(["店的位置"]);
    expect(labels("3.2.2")).toEqual(["我妹的同桌"]);
    expect(labels("3.3.1")).toEqual(["我妹的同桌"]);
    const cousin = beats.find((beat) => beat.id === "4.2.2")!.choices![0];
    expect(cousin.需记忆).toBe("我妹的同桌");
  });

  function playToShop(shopIndex = 0) {
    let state = drain(createInitial(beats), "left", beats);
    state = commitReply(choose(state, "left", 0, beats), "left", beats);
    state = drain(state, "left", beats);
    state = commitReply(choose(state, "left", shopIndex, beats), "left", beats);
    state = drain(state, "left", beats);
    return state;
  }

  function playGirlMakeup(state: ReturnType<typeof createInitial>, makeupIndex = 0) {
    state = drain(state, "right", beats);
    state = commitReply(choose(state, "right", makeupIndex, beats), "right", beats);
    return state;
  }

  function playBoyArrivalTalk(state: ReturnType<typeof createInitial>) {
    state = drain(state, "left", beats);
    expect(state.pending.left?.kind).toBe("choices");
    state = commitReply(choose(state, "left", 1, beats), "left", beats); // 主动攀谈
    state = drain(state, "left", beats);
    state = commitReply(choose(state, "left", 0, beats), "left", beats); // 安抚
    return state; // 3.2.2 等女生确认地址，男生停住
  }

  function playGirlSubway(state: ReturnType<typeof createInitial>) {
    state = drain(state, "right", beats); // 3.4.1 lines → choices
    expect(state.pending.right).toEqual({ kind: "choices", beatId: "3.4.1" });
    return state;
  }

  it("gates the precise-route choice until the shop memory is saved", () => {
    const base = playGirlSubway(playBoyArrivalTalk(playGirlMakeup(playToShop(0))));
    expect(base.pending.right).toEqual({ kind: "choices", beatId: "3.4.1" });
    expect(() => choose(base, "right", 0, beats)).toThrow(/店的位置/);
    const guessed = commitReply(choose(base, "right", 1, beats), "right", beats);
    expect(guessed.pending.right).toEqual({ kind: "lines", beatId: "3.4.2", lineIndex: 0 });
    const saved = saveMemory(base, "right", {
      label: "店的位置",
      text: "小寨华旗国际A座",
      beatId: "R1-shiguang",
    });
    const precise = commitReply(choose(saved, "right", 0, beats), "right", beats);
    expect(precise.pending.right).toEqual({ kind: "lines", beatId: "3.4.3-A", lineIndex: 0 });
    const again = saveMemory(saved, "right", { label: "店的位置", text: "重复", beatId: "R1-shiguang" });
    expect(again.memories.right).toHaveLength(1);
  });

  it("echoes the makeup advice in the ARTX beat", () => {
    const madeUp = playGirlSubway(playBoyArrivalTalk(playGirlMakeup(playToShop(0), 0)));
    const savedUp = saveMemory(madeUp, "right", { label: "店的位置", text: "小寨华旗国际A座", beatId: "R1-shiguang" });
    const up = drain(commitReply(choose(savedUp, "right", 0, beats), "right", beats), "right", beats);
    expect(up.pending.right).toEqual({ kind: "choices", beatId: "3.4.3-A" });
    expect(messagesFor(up, "right").some((message) => message.text.includes("最后还是化了"))).toBe(true);

    const bareFaced = playGirlSubway(playBoyArrivalTalk(playGirlMakeup(playToShop(0), 1)));
    const savedBare = saveMemory(bareFaced, "right", { label: "店的位置", text: "小寨华旗国际A座", beatId: "R1-shiguang" });
    const bare = drain(commitReply(choose(savedBare, "right", 0, beats), "right", beats), "right", beats);
    expect(bare.pending.right).toEqual({ kind: "choices", beatId: "3.4.3-B" });
    expect(messagesFor(bare, "right").some((message) => message.text.includes("光线暗"))).toBe(true);
  });

  it("gates the cousin bridge behind the classmate memory", () => {
    let state = playGirlSubway(playBoyArrivalTalk(playGirlMakeup(playToShop(0))));
    // 女生确认地址（凭印象支线）→ 3.4.1 完成 → 男生看到女生那拍解锁
    state = commitReply(choose(state, "right", 1, beats), "right", beats);
    state = drain(state, "left", beats); // 3.2.2 此前被门槛挡住，现在开演到选项
    // 男生续走：看到女生 → 收线 → 第四幕到 4.2.2
    for (const pick of [0, 0, 0, 0]) {
      state = commitReply(choose(state, "left", pick, beats), "left", beats);
      state = drain(state, "left", beats);
    }
    expect(state.pending.left).toEqual({ kind: "choices", beatId: "4.2.2" });
    expect(() => choose(state, "left", 0, beats)).toThrow(/我妹的同桌/);
    const direct = commitReply(choose(state, "left", 1, beats), "left", beats);
    expect(direct.flags["男生意向"]).toBe("问");
    const dropped = commitReply(choose(state, "left", 2, beats), "left", beats);
    expect(dropped.flags["男生意向"]).toBe("不问");
    const withMemory = saveMemory(state, "left", {
      label: "我妹的同桌",
      text: "好像是我妹的同桌还是什么",
      beatId: "3.2.2",
    });
    const bridged = commitReply(choose(withMemory, "left", 0, beats), "left", beats);
    expect(bridged.flags["男生意向"]).toBe("问");
  });

  it("wipes memories when the beat says so", () => {
    const tinyBeats: Beat[] = [
      {
        id: "A",
        channel: "left",
        lines: [{ from: "boy", text: "去", delivery: "pop" }],
        choices: [{ thought: "走", reply: "好", next: "B" }],
      },
      {
        id: "B",
        channel: "left",
        lines: [{ from: "boy", text: "到了", delivery: "pop" }],
        choices: [{ thought: "回", reply: "嗯" }],
        清空记忆: "all",
      },
    ];
    let state = saveMemory(createInitial(tinyBeats), "left", { label: "旧记忆", text: "旧的", beatId: "A" });
    state = drain(state, "left", tinyBeats);
    state = commitReply(choose(state, "left", 0, tinyBeats), "left", tinyBeats);
    state = drain(state, "left", tinyBeats);
    state = commitReply(choose(state, "left", 0, tinyBeats), "left", tinyBeats);
    expect(state.completed).toContain("B");
    expect(state.memories).toEqual({ left: [], right: [] });
  });

  it("rejects candidates whose phrase is missing from the beat text", () => {
    const beats: Beat[] = [
      {
        id: "A",
        channel: "left",
        lines: [{ from: "boy", text: "我今天路过一家店，招牌是蓝色的", delivery: "type" }],
        记忆候选: [{ 缩略标签: "蓝招牌", 短句: "招牌是绿色", 类型: "教学", 线: "无" }],
      },
    ];
    const script = {
      title: "校验用",
      speakers: [
        { id: "boy", name: "男生", channel: "left" as const },
        { id: "girl", name: "女生", channel: "right" as const },
      ],
      beats,
    };
    const result = validateScript(script);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("蓝招牌");
  });
});

describe("chapter 5", () => {
  const script = loadBundledScript().script!;
  const beats = script.beats;

  /** 直接站到幕5门前：幕1-4 全部完成，旗标按参数设置。 */
  function atActFive(flags: Record<string, Scalar>): EngineState {
    const base = createInitial(beats);
    return {
      ...base,
      flags,
      completed: beats.filter((beat) => beat.chapter !== 5).map((beat) => beat.id),
    };
  }

  /** 一路自动走：drain 到选项就选第一个，直到这一侧没得可走。 */
  function autoPlay(state: EngineState, channel: Channel): EngineState {
    let cur = state;
    for (let step = 0; step < 30; step += 1) {
      cur = drain(cur, channel, beats);
      const pending = cur.pending[channel];
      if (!pending) return cur;
      if (pending.kind !== "choices") throw new Error(`drain 停在了非选项处：${pending.kind}`);
      cur = commitReply(choose(cur, channel, 0, beats), channel, beats);
    }
    throw new Error("步数过多");
  }

  it("picks the opening variant from act-4 intention flags", () => {
    const both = atActFive({ 男生意向: "问", 女生意向: "问" });
    expect(availableBeat(both, "left", beats)?.id).toBe("5m.1.1-A");
    expect(availableBeat(both, "right", beats)?.id).toBe("5f.1.1-A");
    const boyOnly = atActFive({ 男生意向: "问", 女生意向: "不问" });
    expect(availableBeat(boyOnly, "left", beats)?.id).toBe("5m.1.1-B");
    expect(availableBeat(boyOnly, "right", beats)?.id).toBe("5f.1.1-C");
    const girlOnly = atActFive({ 男生意向: "不问", 女生意向: "问" });
    expect(availableBeat(girlOnly, "left", beats)?.id).toBe("5m.1.1-C");
    expect(availableBeat(girlOnly, "right", beats)?.id).toBe("5f.1.1-B");
    // 双不问：没有任何变体可放行，游戏止于幕4
    const neither = atActFive({ 男生意向: "不问", 女生意向: "不问" });
    expect(availableBeat(neither, "left", beats)).toBeNull();
    expect(availableBeat(neither, "right", beats)).toBeNull();
  });

  it("wipes this window's teaching memories when act 5 opens", () => {
    let state = saveMemory(atActFive({ 男生意向: "问", 女生意向: "问" }), "left", {
      label: "我妹的同桌",
      text: "好像是我妹的同桌还是什么",
      beatId: "3.2.2",
    });
    state = saveMemory(state, "right", {
      label: "店的位置",
      text: "小寨华旗国际A座",
      beatId: "R1-shiguang",
    });
    state = autoPlay(state, "left");
    expect(state.completed).toContain("5m.1.1-A");
    expect(state.memories.left).toEqual([]);
    expect(state.memories.right).toHaveLength(1); // 女窗还没入场，教学记忆不动
  });

  it("runs both windows to the end across the cross-lane waits and sets 在一起", () => {
    let state = atActFive({ 男生意向: "问", 女生意向: "问" });
    // 女窗先走：停在 5f.2.1 前，等男生先开口约局
    state = autoPlay(state, "right");
    expect(state.completed).toContain("5f.1.1111");
    expect(state.completed).not.toContain("5f.2.1");
    // 男窗一路走完
    state = autoPlay(state, "left");
    expect(state.completed).toContain("5m.4.11");
    expect(state.flags["在一起"]).toBe(true);
    // 女窗接着走完
    state = autoPlay(state, "right");
    expect(state.completed).toContain("5f.4.11");
    expect(state.flags["在一起"]).toBe(true);
  });
});

describe("serial pacing", () => {
  const beats = loadBundledScript().script!.beats;

  it("starts on the left and blocks the peer while playback is running", () => {
    const state = createInitial(beats);
    expect(canArm(state, "left", beats)).toBe(true);
    expect(canArm(state, "right", beats)).toBe(false);
    const playing = openChannel(state, "left", beats);
    expect(playing.pending.left?.kind).toBe("lines");
    expect(canArm(playing, "right", beats)).toBe(false);
  });

  it("holds the girl back while the boy's beat is still playing, then lets her in", () => {
    let state = drain(createInitial(beats), "left", beats); // L1 → choices
    state = commitReply(choose(state, "left", 0, beats), "left", beats); // L1 完成，自动接 L2
    state = drain(state, "left", beats); // L2 → choices
    state = commitReply(choose(state, "left", 0, beats), "left", beats); // 选店，L2 完成，自动接 L3
    // 男生 L3 还在播（引擎自动接上）→ 女生虽已就绪（requires L2 满足）但被串行门挡住
    expect(state.pending.left?.kind).toBe("lines");
    expect(canArm(state, "right", beats)).toBe(false);
    state = drain(state, "left", beats); // L3 OK 播完，男生下一拍被 R2 挡住 → 女生放行
    expect(state.pending.left).toBeNull();
    expect(canArm(state, "right", beats)).toBe(true);
    expect(canArm(state, "left", beats)).toBe(false);
  });

  it("treats a pane waiting on choices as finished, and holds the boy until the girl confirms the address", () => {
    let state = drain(createInitial(beats), "left", beats); // L1 → choices
    state = commitReply(choose(state, "left", 0, beats), "left", beats); // L1 完成 → L2
    state = drain(state, "left", beats); // L2 → choices
    state = commitReply(choose(state, "left", 0, beats), "left", beats); // 选店 → L3
    state = drain(state, "right", beats); // R1 → R2 choices
    state = commitReply(choose(state, "right", 0, beats), "right", beats); // 化
    state = drain(state, "left", beats); // L3 OK，男生到店就绪
    state = commitReply(choose(state, "left", 1, beats), "left", beats); // 主动攀谈 → 3.2.1
    state = drain(state, "left", beats); // 3.2.1 → choices
    state = commitReply(choose(state, "left", 0, beats), "left", beats); // 安抚
    // 3.2.2 等女生确认地址 → 男生停住
    expect(state.pending.left).toBeNull();
    state = drain(state, "right", beats); // 3.4.1 lines → choices
    expect(state.pending.right?.kind).toBe("choices");
    // 女生还停在问路选项上：3.4.1 未完成，男生看到女生那拍开不了
    expect(canArm(state, "left", beats)).toBe(false);
    state = commitReply(choose(state, "right", 1, beats), "right", beats); // 凭印象 → 3.4.1 完成
    state = drain(state, "right", beats); // 3.4.2 → choices（地址已从同学那确认）
    // 女生停在吐槽选项等玩家 → 视为"完全结束"，男生可以开演
    expect(canArm(state, "left", beats)).toBe(true);
    expect(canArm(state, "right", beats)).toBe(false);
  });
});

describe("context reset", () => {
  const beats = loadBundledScript().script!.beats;

  it("clears one window's messages but keeps the other side and saved memories", () => {
    let state = drain(createInitial(beats), "left", beats);
    state = commitReply(choose(state, "left", 0, beats), "left", beats);
    state = drain(state, "left", beats);
    state = commitReply(choose(state, "left", 0, beats), "left", beats);
    state = drain(state, "right", beats); // R1 播完、R2 停在选项
    const withMemory = saveMemory(state, "right", {
      label: "店的位置",
      text: "小寨华旗国际A座",
      beatId: "R1-shiguang",
    });
    const cleared = clearChannelMessages(withMemory, "right");
    expect(messagesFor(cleared, "right")).toEqual([]);
    expect(messagesFor(cleared, "left").length).toBeGreaterThan(0);
    expect(cleared.memories.right).toHaveLength(1);
    expect(clearChannelMessages(cleared, "right")).toBe(cleared);
  });
});
