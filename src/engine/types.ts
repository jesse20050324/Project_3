export type Channel = "left" | "right";

export type Delivery = "type" | "pop" | "image" | "thought";

export type Scalar = string | number | boolean;

/** 一条消息解析后的定值节拍。UI 直接消费，不再在组件里重算。 */
export type Timing = {
  /** 消息出现前的静默（停顿感）。 */
  pauseBeforeMs: number;
  /** 「正在输入」三点持续多久。 */
  indicatorMs: number;
  /** 逐字输出时每个字的间隔。 */
  typeIntervalMs: number;
  /** 消息完整呈现后停留多久再进入下一句。 */
  afterMs: number;
};

/** YAML 里可写的节拍值：具名预设，或对单个字段的数值覆盖。 */
export type PacingValue = string | Partial<Timing>;

/** 记忆候选：可高亮存档的原文片段，挂在节拍上（①用户台词或④AI回复内）。 */
export type MemoryCandidate = {
  缩略标签: string;
  短句: string;
  类型?: string;
  线?: string;
};

/** 已存记忆：按窗（channel）分池存放。 */
export type MemoryEntry = {
  label: string;
  text: string;
  beatId: string;
};

export type Line = {
  from: string;
  text: string;
  delivery: Delivery;
  caption?: string;
  节拍?: PacingValue;
  /** 由 loadScript 按「逐句 → 拍 → 章 → 全局预设」解析后的定值。 */
  timing?: Timing;
};

export type Choice = {
  thought: string;
  reply: string;
  set?: Record<string, Scalar>;
  next?: string;
  /** 置灰门：未存这条缩略标签的记忆时，该选项置灰不可选。 */
  需记忆?: string;
  /** 按声明顺序选择首个本窗记忆全部满足的后继，无匹配时置灰。 */
  记忆后继?: { all: string[]; next: string }[];
  节拍?: PacingValue;
  timing?: Timing;
};

/** 跨窗区间门：对侧进度落在下界之后、上界之前，本拍才可播。 */
export type WindowGate = {
  /** 被度量的对侧窗口。 */
  channel: Channel;
  /** 至少完成其中一拍（数组为空表示无下界）。 */
  下界: string[];
  /** 任何一拍一旦完成，区间即关闭。 */
  上界: string[];
  说明?: string;
};

export type Beat = {
  id: string;
  channel: Channel;
  /** Explicit silent causality/exit marker; never a missing dialogue. */
  control?: boolean;
  requires?: string[];
  /** 旗标必须等于这些值，这一拍才会出现。对不上的分支不显示。 */
  when?: Record<string, Scalar>;
  aside?: string;
  lines: Line[];
  choices?: Choice[];
  next?: string;
  /** 这一拍的可存记忆候选。 */
  记忆候选?: MemoryCandidate[];
  /** 完成本拍后清空记忆（幕5入场清教学记忆用）。 */
  清空记忆?: "all" | Channel;
  /** 这一拍属于哪一章。分章文件合并时写入。 */
  chapter?: number;
  /** 章内稳定序号；剧本未提供时按文件顺序生成。 */
  order?: number;
  /** 全局排序键（章号 × 10^6 + 章内序号），由 timeline.ts 统一算出。 */
  sortKey?: number;
  /** 剧本顶层时间轴的档名，仅用于展示与校验。 */
  time?: string;
  timeRank?: number;
  /** 拍标题；没有时间档时作为栏头与校验的回退标签。 */
  label?: string;
  window?: WindowGate;
  /** 终局标记，值对应 Script.endings[].id。 */
  ending?: string;
  /** 本拍的默认节拍（逐句可再覆盖）。 */
  节拍?: PacingValue;
};

export type Speaker = {
  id: string;
  name: string;
  channel?: Channel;
};

export type ScriptChapter = {
  index: number;
  title: string;
};

export type Ending = {
  id: string;
  title: string;
  /** 双窗都完成这些拍才成立。 */
  requires: string[];
  set?: Record<string, Scalar>;
};

export type Script = {
  title: string;
  speakers: Speaker[];
  beats: Beat[];
  chapters?: ScriptChapter[];
  /** 章号 → 该章顶层时间轴档名。 */
  axes?: Record<number, string[]>;
  endings?: Ending[];
  默认节拍?: string;
  /** 按全局排序键排好序的拍，供调度器与穷举仿真共用。 */
  orderedBeats?: Beat[];
  beatById?: Map<string, Beat>;
};

export type ChatMessage = {
  id: string;
  channel: Channel;
  beatId: string;
  from: string;
  text: string;
  delivery: Delivery;
  caption?: string;
  timing?: Timing;
};

export type Pending =
  | { kind: "lines"; beatId: string; lineIndex: number }
  | { kind: "choices"; beatId: string }
  | { kind: "reply"; beatId: string; choiceIndex: number; memoryNext?: string };

/** 跨章「上下文重置」仪式。存进 EngineState，刷新后可恢复，不再靠 React 局部 state。 */
export type Ritual = {
  from: number;
  to: number;
  phase: "mask" | "pause";
  /** Date.now() 截止时刻；到期由 ritual-tick 推进。 */
  until: number;
};

export type EngineState = {
  completed: string[];
  flags: Record<string, Scalar>;
  activated: string[];
  messages: ChatMessage[];
  pending: Record<Channel, Pending | null>;
  /** 记忆池：按窗分放，互不共享（对话隔离）。 */
  memories: Record<Channel, MemoryEntry[]>;
  /** 每窗当前章号，显式维护，不再从消息历史反推。 */
  chapter: Record<Channel, number>;
  /** 持久化跨章仪式。 */
  ritual: Record<Channel, Ritual | null>;
  /** 已达成的终局 id。 */
  endings: string[];
  /** reducer 异常不再静默吞掉，写入这里供运行时观测。 */
  error: string | null;
  /** 每次重新开始自增，参与消息 token，避免旧 ref 误判去重。 */
  runId: number;
};

export type ChannelMode = "available" | "gated" | "ended" | "empty";

export type LockedBeat = {
  id: string;
  unmet: string[];
};

export type ChannelView = {
  mode: ChannelMode;
  availableId: string | null;
  locked: LockedBeat[];
  /** 已抵达的终局（若非空，UI 显示结束态）。 */
  endingId: string | null;
};
