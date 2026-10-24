export type Channel = "left" | "right";

export type Delivery = "type" | "pop" | "image" | "thought";

export type Scalar = string | number | boolean;

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
