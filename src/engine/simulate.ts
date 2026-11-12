import {
  availableBeat, canArm, channelView, choiceMemoryGate, choiceMemoryLabels, choose, commitLine, commitReply, createInitial,
  detectWindowViolation, hasMemory, matchingMemoryRoute, openChannel, playbackStep, ritualTick, saveMemory,
} from "./scheduler";
import { compareBeats } from "./timeline";
import type { Beat, Channel, EngineState, Script } from "./types";

/**
 * 无 React 的纯函数剧本仿真：把状态机当成图来遍历，
 * 穷举所有「入场旗标组合 × 每个分叉的每个选项」，验证：
 *  - 每一拍都能被播到（无孤儿、无播不到的分支）
 *  - 不会卡死（无限等待 / 章切换中断）
 *  - 区间门不会越界（顺序反了会报错）
 *  - 终局可抵达，且章切换刷新后仍能继续
 *
 * 用「状态签名去重」而不是穷举路径：分支汇合后状态相同，只遍历一次，
 * 第五幕 6 处真分叉 + 前四幕的分支也能在毫秒级完整覆盖。
 */
export type SimulationOptions = {
  /** 是否模拟「玩家把看到的高亮都存下来」（用于解锁置灰门）。 */
  autoSave?: boolean;
  maxStates?: number;
  maxStepsPerDrive?: number;
};

export type SimulationResult = {
  ok: boolean;
  errors: string[];
  states: number;
  paths: number;
  visitedBeats: Set<string>;
  unvisitedBeats: string[];
  endings: string[];
  /** 提前结束（未抵达终局）的状态数，例如幕4「双不问」的定稿早停分支。 */
  stoppedWithoutEnding: number;
  chapterTransitions: number;
};

type DriveResult = {
  state: EngineState;
  choices: { channel: Channel; indices: number[] }[];
  terminal: boolean;
  error: string | null;
  steps: number;
  transitions: number;
};

/**
 * 只有「后续决策还会用到」的 id 才进签名。
 * 已经播完、且不再被任何 requires / 区间门 / 终局引用的历史分叉拍，
 * 保留与否不影响未来行为；把它们折叠掉，避免分支组合数阶乘级膨胀。
 */
function buildConstraintIds(beats: Beat[]): Set<string> {
  const ids = new Set<string>();
  for (const beat of beats) {
    for (const id of beat.requires ?? []) ids.add(id);
    for (const id of beat.window?.下界 ?? []) ids.add(id);
    for (const id of beat.window?.上界 ?? []) ids.add(id);
    if (beat.ending) ids.add(beat.id);
  }
  return ids;
}

function makeSignature(beats: Beat[]): (state: EngineState) => string {
  const byId = new Map(beats.map(beat => [beat.id, beat]));
  const chapterCache = new Map<string, { constraints: Set<string>; flags: Set<string>; gates: Set<string> }>();
  return (state: EngineState) => {
    const key = `${state.chapter.left}/${state.chapter.right}`;
    let live = chapterCache.get(key);
    if (!live) {
      const future = beats.filter(beat => (beat.chapter ?? state.chapter[beat.channel]) >= state.chapter[beat.channel]);
      live = {
        constraints: buildConstraintIds(future),
        flags: new Set(future.flatMap(beat => Object.keys(beat.when ?? {}))),
        gates: new Set(future.flatMap(beat => beat.choices?.flatMap(choiceMemoryLabels) ?? [])),
      };
      chapterCache.set(key, live);
    }
    const completed = new Set(state.completed);
    return JSON.stringify({
    completed: state.completed.filter(id => live.constraints.has(id)).sort(),
    activated: state.activated.filter(id => {
      const beat = byId.get(id);
      return beat && !completed.has(id) && (beat.chapter ?? state.chapter[beat.channel]) >= state.chapter[beat.channel];
    }).sort(),
    flags: Object.keys(state.flags).filter(flag => live.flags.has(flag)).sort().map(flag => [flag, state.flags[flag]]),
    pending: state.pending,
    chapter: state.chapter,
    ritual: {
      left: state.ritual?.left?.phase ?? null,
      right: state.ritual?.right?.phase ?? null,
    },
    endings: state.endings,
    memories: {
      left: state.memories.left.map(memory => memory.label).filter(label => live.gates.has(label)).sort(),
      right: state.memories.right.map(memory => memory.label).filter(label => live.gates.has(label)).sort(),
    },
    });
  };
}

function ritualsOf(state: EngineState): Channel[] {
  return (["left", "right"] as Channel[]).filter((channel) => state.ritual?.[channel]);
}

function busyOf(state: EngineState): { channel: Channel; kind: "lines" | "reply" } | null {
  for (const channel of ["left", "right"] as Channel[]) {
    const pending = state.pending[channel];
    if (pending?.kind === "lines" || pending?.kind === "reply") return { channel, kind: pending.kind };
  }
  return null;
}

function choiceChannels(state: EngineState): Channel[] {
  return (["left", "right"] as Channel[]).filter((channel) => state.pending[channel]?.kind === "choices");
}

/** 模拟玩家把当前可见的记忆候选都点存下来，用于解锁置灰门选项。 */
function autoSaveVisible(state: EngineState, beats: Beat[]): EngineState {
  let next = state;
  const byId = new Map(beats.map((beat) => [beat.id, beat]));
  // Simulate explicit replacements that keep the remaining choices exercisable.
  const latest: Partial<Record<Channel, Beat>> = {};
  for (const id of state.completed) {
    const beat = byId.get(id);
    if (beat && (!latest[beat.channel] || compareBeats(beat, latest[beat.channel]!) > 0)) latest[beat.channel] = beat;
  }
  const future = beats.filter(beat => !latest[beat.channel] || compareBeats(beat, latest[beat.channel]!) > 0);
  const remainingGates = new Set(future.flatMap(beat => beat.choices?.flatMap(choiceMemoryLabels) ?? []));
  const branchGates = new Set(future.filter(beat =>
    new Set(beat.choices?.flatMap(choice => choice.记忆后继?.map(route => route.next) ?? [choice.next])).size > 1)
    .flatMap(beat => beat.choices?.flatMap(choiceMemoryLabels) ?? []));
  const matrixLabels = new Set(beats.flatMap(beat => beat.choices?.flatMap(choice =>
    choice.记忆后继?.flatMap(route => route.all) ?? []) ?? []));
  for (const message of state.messages) {
    const beat = byId.get(message.beatId);
    for (const candidate of beat?.记忆候选 ?? []) {
      if (!message.text.includes(candidate.短句)) continue;
      if (hasMemory(next, message.channel, candidate.缩略标签)) continue;
      const entry = {
        label: candidate.缩略标签,
        text: candidate.短句,
        beatId: message.beatId,
      };
      const saved = saveMemory(next, message.channel, entry);
      if (saved !== next) {
        next = saved;
      } else if (remainingGates.has(entry.label)) {
        const replacement = next.memories[message.channel].find(memory => !remainingGates.has(memory.label))
          ?? (matrixLabels.has(entry.label) ? next.memories[message.channel].find(memory => !branchGates.has(memory.label)) : undefined);
        if (replacement) next = saveMemory(next, message.channel, entry, replacement.label);
      }
    }
  }
  return next;
}

/** 把状态一路推到「需要玩家选择」或「彻底停下来」。 */
function currentError(state: EngineState, beats: Beat[]): string | null {
  // 仿真直接驱动纯函数 scheduler，不经过 reducer，因此要自己检查区间越界。
  return state.error ?? detectWindowViolation(state, beats);
}

function drive(
  start: EngineState,
  beats: Beat[],
  maxSteps: number,
): DriveResult {
  let state = start;
  let steps = 0;
  let transitions = 0;

  while (steps < maxSteps) {
    // 跨章仪式：按 until 直接推进，等价于刷新后恢复计时器
    const rituals = ritualsOf(state);
    if (rituals.length > 0) {
      for (const channel of rituals) {
        const ritual = state.ritual[channel];
        if (!ritual) continue;
        state = ritualTick(state, channel, ritual.until);
        transitions += 1;
      }
      steps += 1;
      continue;
    }

    const busy = busyOf(state);
    if (busy) {
      state = busy.kind === "lines"
        ? commitLine(state, busy.channel, beats)
        : commitReply(state, busy.channel, beats);
      steps += 1;
      continue;
    }

    const choosing = choiceChannels(state);
    if (choosing.length > 0) {
      // 两个窗同时等选择时按固定顺序（左→右）逐个解决。
      // 两边选择彼此独立，穷举「选择顺序」只会让状态数阶乘级膨胀，不增加覆盖。
      const channel = choosing[0];
      const pending = state.pending[channel];
      const beat = beats.find((item) => item.id === pending?.beatId);
      const indices = (beat?.choices ?? []).map((_, index) => index);
      return {
        state,
        choices: [{ channel, indices }],
        terminal: false,
        error: currentError(state, beats),
        steps,
        transitions,
      };
    }

    const step = playbackStep(state, beats);
    if (step) {
      state = openChannel(state, step.channel, beats, 0);
      steps += 1;
      continue;
    }
    return { state, choices: [], terminal: true, error: currentError(state, beats), steps, transitions };
  }
  return {
    state,
    choices: [],
    terminal: false,
    error: currentError(state, beats) ?? `仿真超过 ${maxSteps} 步仍未停，疑似死锁`,
    steps,
    transitions,
  };
}

function deadlockDetail(state: EngineState, beats: Beat[]): string {
  const parts: string[] = [];
  for (const channel of ["left", "right"] as Channel[]) {
    const view = channelView(state, channel, beats);
    parts.push(
      `${channel}: mode=${view.mode}, canArm=${canArm(state, channel, beats)}, ` +
      `available=${availableBeat(state, channel, beats)?.id ?? "无"}, ` +
      `locked=${view.locked.map((item) => `${item.id}[${item.unmet.join(",")}]`).join("|") || "无"}`,
    );
  }
  return parts.join("；");
}

export function simulateScript(script: Script, options: SimulationOptions = {}): SimulationResult {
  const {
    autoSave = true,
    maxStates = 20000,
    maxStepsPerDrive = 4000,
  } = options;
  const beats = script.beats;
  const errors: string[] = [];
  const visitedBeats = new Set<string>();
  const endings = new Set<string>();
  const seen = new Set<string>();
  const signatureOf = makeSignature(beats);
  const stack: EngineState[] = [createInitial(beats)];
  const lastChapter = Math.max(...beats.map(beat => beat.chapter ?? 0));
  const finalEndings = new Set(beats.filter(beat => beat.chapter === lastChapter && beat.ending).map(beat => beat.ending));
  let stoppedWithoutEnding = 0;
  let chapterTransitions = 0;
  let paths = 0;

  while (stack.length > 0) {
    if (seen.size >= maxStates) {
      errors.push(`仿真状态数超过上限 ${maxStates}，剧本分支可能异常膨胀。`);
      break;
    }
    const current = stack.pop()!;
    const sig = signatureOf(current);
    if (seen.has(sig)) continue;
    seen.add(sig);
    for (const id of current.completed) visitedBeats.add(id);

    const driven = drive(current, beats, maxStepsPerDrive);
    chapterTransitions += driven.transitions;
    for (const id of driven.state.completed) visitedBeats.add(id);
    if (driven.error) {
      errors.push(`${driven.error}（${deadlockDetail(driven.state, beats)}）`);
      continue;
    }
    if (!driven.terminal && driven.choices.length === 0) {
      errors.push(`仿真卡住：${deadlockDetail(driven.state, beats)}`);
      continue;
    }
    if (driven.terminal) {
      paths += 1;
      for (const ending of driven.state.endings) endings.add(ending);
      if (driven.state.endings.length && finalEndings.size
        && !driven.state.endings.some(ending => finalEndings.has(ending))) {
        errors.push(`进入主线后未抵达最终幕出口：${deadlockDetail(driven.state, beats)}`);
      }
      if (driven.state.endings.length === 0) {
        stoppedWithoutEnding += 1;
        // 未抵达终局但仍有可播拍 = 真死锁；定稿允许幕4「双不问」提前收线。
        const stuck = (["left", "right"] as Channel[]).some((channel) =>
          availableBeat(driven.state, channel, beats) !== null || driven.state.pending[channel] !== null,
        );
        if (stuck) errors.push(`终局未达成却还有拍可播：${deadlockDetail(driven.state, beats)}`);
      }
      continue;
    }

    const prepared = autoSave ? autoSaveVisible(driven.state, beats) : driven.state;
    for (const group of driven.choices) {
      for (const index of group.indices) {
        const beat = beats.find((item) => item.id === prepared.pending[group.channel]?.beatId);
        const choice = beat?.choices?.[index];
        if (choice && choiceMemoryGate(prepared, group.channel, choice)) continue;
        // Exercise every evidenced route by keeping or discarding the relevant
        // saved memories. Never add a memory the simulated player did not see.
        const states = [prepared];
        if (autoSave && choice?.记忆后继) {
          const labels = new Set(choiceMemoryLabels(choice));
          for (const route of choice.记忆后继) {
            const saved = prepared.memories[group.channel].filter(memory =>
              !labels.has(memory.label) || route.all.includes(memory.label) || choice.需记忆 === memory.label);
            const candidate = { ...prepared, memories: { ...prepared.memories, [group.channel]: saved } };
            if (matchingMemoryRoute(candidate, group.channel, choice)?.next === route.next) states.push(candidate);
          }
        }
        for (const state of states) {
          try {
            stack.push(choose(state, group.channel, index, beats));
          } catch (error) {
            errors.push(`仿真在 ${group.channel}/${beat?.id} 选第 ${index + 1} 项失败：${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
    }
  }

  const playableIds = new Set(
    beats
      .filter((beat) => !beat.when || beat.ending || beat.requires || beat.next || beat.choices?.some((choice) => choice.next))
      .map((beat) => beat.id),
  );
  // 真正关心的是「有没有拍永远播不到」；入场变体的落选分支不算缺失，另行统计。
  const unvisitedBeats = [...playableIds]
    .filter((id) => !visitedBeats.has(id))
    .filter((id) => {
      const beat = beats.find((item) => item.id === id);
      return !beat?.when;
    })
    .sort();

  if (unvisitedBeats.length > 0) {
    errors.push(`有 ${unvisitedBeats.length} 拍在任何路径下都播不到：${unvisitedBeats.join("、")}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    states: seen.size,
    paths,
    visitedBeats,
    unvisitedBeats,
    endings: [...endings],
    stoppedWithoutEnding,
    chapterTransitions,
  };
}
