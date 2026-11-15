import { createContext, useContext } from "react";
import raw from "./englishScript.json";
import type { ChatMessage, MemoryEntry } from "./engine/types";

export type Language = "en" | "zh";
export const LanguageContext = createContext({ language: "zh" as Language, setLanguage: (_language: Language) => {} });
export function useLanguage() {
  const { language, setLanguage } = useContext(LanguageContext);
  return { language, setLanguage, t: (zh: string, en: string) => language === "en" ? en : zh };
}

export function LanguageSwitch() {
  const { language, setLanguage } = useLanguage();
  return <div className="language-switch" role="group" aria-label="Language / 语言">
    <button type="button" lang="en" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>EN</button>
    <button type="button" lang="zh-CN" aria-pressed={language === "zh"} onClick={() => setLanguage("zh")}>中文</button>
  </div>;
}

type Translation = {
  time: string;
  lines: string[][];
  choices: { thought: string[]; reply: string[] }[];
  memories: { label: string; name: string; quote: string[] }[];
};
export const englishBeats: Record<string, Translation | undefined> = raw.beats;
export const englishTitles = raw.titles;
export const englishSummaries: Record<string, string | undefined> = raw.summaries;
export const englishEndings: Record<string, string | undefined> = raw.endings;

export function messageText(message: Pick<ChatMessage, "id" | "beatId" | "text">) {
  const beat = englishBeats[message.beatId];
  const slot = message.id.match(/:(?:(reply):)?(\d+)$/);
  const translation = slot?.[1] === "reply" ? beat?.choices[Number(slot[2])]?.reply
    : slot ? beat?.lines[Number(slot[2])] : undefined;
  return translation?.[0]?.trim() === message.text.trim() ? translation[1] : message.text;
}

export function memoryDisplay(memory: MemoryEntry) {
  const translated = englishBeats[memory.beatId]?.memories.find(item => item.label === memory.label);
  return { label: translated?.name ?? memory.label, text: translated?.quote[1] ?? memory.text };
}

export function memoryName(label: string) {
  return Object.values(englishBeats).flatMap(beat => beat?.memories ?? []).find(item => item.label === label)?.name ?? label;
}
