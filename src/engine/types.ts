export type Channel = "left" | "right";

export type Delivery = "type" | "pop" | "image" | "thought";

export type Scalar = string | number | boolean;

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
};

export type Choice = {
  thought: string;
  reply: string;
  set?: Record<string, Scalar>;
  next?: string;
  /** 置灰门：未存这条缩略标签的记忆时，该选项置灰不可选。 */
  需记忆?: string;
};

export type Beat = {
  id: string;
  channel: Channel;
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

export type Script = {
  title: string;
  speakers: Speaker[];
  beats: Beat[];
  chapters?: ScriptChapter[];
};

export type ChatMessage = {
  id: string;
  channel: Channel;
  beatId: string;
  from: string;
  text: string;
  delivery: Delivery;
  caption?: string;
};

export type Pending =
  | { kind: "lines"; beatId: string; lineIndex: number }
  | { kind: "choices"; beatId: string }
  | { kind: "reply"; beatId: string; choiceIndex: number };

export type EngineState = {
  completed: string[];
  flags: Record<string, Scalar>;
  activated: string[];
  messages: ChatMessage[];
  pending: Record<Channel, Pending | null>;
  /** 记忆池：按窗分放，互不共享（对话隔离）。 */
  memories: Record<Channel, MemoryEntry[]>;
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
};
