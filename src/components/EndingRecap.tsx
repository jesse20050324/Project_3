import { finalChoiceBeatId, type storyOutcome } from "../engine/scheduler";
import type { Channel, EngineState, Script } from "../engine/types";
import { englishBeats, memoryName, useLanguage } from "../language";

type Outcome = NonNullable<ReturnType<typeof storyOutcome>>;

export function EndingRecap({ outcome, state, script, channel }: {
  outcome: Outcome;
  state: EngineState;
  script: Script;
  channel: Channel;
}) {
  const { t } = useLanguage();
  const bothReflected = state.flags["8_M_认识"] === true && state.flags["8_F_认识"] === true;
  const result = outcome === "未交换微信"
    ? t("两人都没有提出加微信，聚会后也没有继续联系。",
      "Neither of them asked to exchange WeChat contacts, and they did not keep in touch after the meetup.")
    : outcome === "分手"
      ? t("争吵中，两人主要在指出对方的问题，也都认为自己的做法有理由。两人最终分手。",
        "During the argument, each focused on what the other had done wrong and felt justified in their own actions. They eventually broke up.")
      : bothReflected
        ? t("两人在再次沟通前，都已经意识到自己的做法有不妥之处。两人互相道歉，决定继续交往。",
          "Before they spoke again, both had realized they could have handled things differently. They apologized to each other and decided to stay together.")
        : t("一方先意识到自己的做法让对方不舒服，并主动道歉。另一方随后也承认了自己的问题。两人和好。",
          "One of them realized how their actions had affected the other and apologized first. The other then acknowledged their part. They made up.");

  const beatId = finalChoiceBeatId[channel];
  const beat = script.beatById?.get(beatId) ?? script.beats.find(item => item.id === beatId);
  const choices = beat?.choices ?? [];
  const saved = state.finalChoices?.[channel];
  const reflectionFlag = channel === "left" ? "8_M_认识" : "8_F_认识";
  const reflected = state.flags[reflectionFlag];
  // Older saves retain the chosen branch, but not the options that were available.
  const index = saved?.index ?? choices.findIndex(choice => typeof reflected === "boolean"
    && choice.set?.[reflectionFlag] === reflected);
  const choice = choices[index];
  const labels = saved?.memoryLabels ?? choice?.记忆后继?.find(route => state.activated.includes(route.next))?.all;
  const names = labels?.map(label => t(`「${label}」`, `“${memoryName(label)}”`)).join(t("", ", "));
  const memory = labels === undefined
    ? t("旧存档未记录当时的记忆状态", "Memory status was not recorded in this save")
    : !names
      ? t("反思选项未解锁", "The reflection option was locked")
      : choice?.记忆后继
        ? t(`已使用${names}`, `Used ${names}`)
        : t(`${names}解锁了反思选项，本次未使用`, `${names} unlocked the reflection option but were not used`);

  return <div className="ending-recap" data-testid="ending-recap">
    {outcome !== "未交换微信" && choice ? <div className="ending-choice">
      <p>{t("最终选择", "Final choice")}　{t(choice.thought, englishBeats[beatId]?.choices[index]?.thought[1] ?? choice.thought)}</p>
      <p>{t("记忆", "Memory")}　{memory}</p>
    </div> : null}
    <p data-testid="ending-result">{result}</p>
  </div>;
}
