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
    expect(messagesFor(state, "left").at(-1)?.text).toBe("OK");
    expect(state.completed).toEqual(["L1", "L2", "L3"]);
    expect(messagesFor(state, "right")).toEqual([]);
    expect(state.pending.right).toBeNull();
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
