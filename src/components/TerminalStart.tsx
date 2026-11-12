import { useEffect, useState } from "react";
import { Game } from "../Game";
import type { Script } from "../engine/types";
import { TerminalFrame } from "./TerminalFrame";
import { terminalUsers } from "../terminalIdentity";
import { useReducedMotion } from "../terminalMotion";

type Entry = "new" | "resume";
type BootLine = { text: string; start: number; duration: number };
const profileHold = 1500;
const headerTime = 240;
const lineTime = 900;
const columnTime = 420;
const workspaceHold = 1500;

function sequence(entry: Entry): BootLine[] {
  const left = terminalUsers.left;
  const right = terminalUsers.right;
  const fields = (user: typeof left) => `      性别 ${user.gender} / ${user.age} 岁 / ${user.work} / ${user.city}`;
  const lines: [string, number, number][] = [
    ["[BOOT] 校验会话模块 … OK", 24, 110],
    ["[SYS] 导入助手系统提示词 … OK", 25, 130],
    [`[USER ${left.id}] 载入用户信息 · ${left.name}`, 40, 150],
    [fields(left), 38, 300],
    [`[USER ${right.id}] 载入用户信息 · ${right.name}`, 40, 150],
    [fields(right), 38, 300],
    [entry === "new" ? "[MEM] 初始化两路独立记忆区 … OK" : "[MEM] 恢复两路上下文与记忆 … OK", 25, 135],
    ["[CTX] 建立会话与摘要目录", 26, 0],
  ];
  let start = 90;
  return lines.map(([text, interval, pause]) => {
    const duration = text.length * interval;
    const line = { text, start, duration };
    start += duration + pause;
    return line;
  });
}

function reveal(elapsed: number, duration: number, steps: number) {
  const progress = Math.max(0, Math.min(1, elapsed / duration));
  return Math.floor(progress * steps) / steps * 100;
}

export function TerminalStart({ entry, script, onTitle }: {
  entry: Entry; script: Script; onTitle: () => void;
}) {
  const reduced = useReducedMotion();
  const [elapsed, setElapsed] = useState(0);
  const lines = sequence(entry);
  const last = lines.at(-1)!;
  const logEnd = last.start + last.duration;
  const shellStart = logEnd + profileHold;
  const columnsStart = shellStart + headerTime + lineTime;
  const workspaceReady = columnsStart + 3 * columnTime;
  const ready = workspaceReady + workspaceHold;

  useEffect(() => {
    if (reduced) { setElapsed(ready); return; }
    const start = Date.now();
    const tick = window.setInterval(() => setElapsed(Math.min(ready, Date.now() - start)), 20);
    const boundaries = [logEnd, shellStart, workspaceReady, ready].map(at =>
      window.setTimeout(() => {
        setElapsed(Math.min(ready, Date.now() - start));
        if (at === ready) window.clearInterval(tick);
      }, at));
    return () => {
      window.clearInterval(tick);
      boundaries.forEach(timer => window.clearTimeout(timer));
    };
  }, [reduced, logEnd, shellStart, workspaceReady, ready]);

  if (reduced || elapsed >= shellStart) {
    return <Game script={script} onTitle={onTitle} intro={reduced || elapsed >= ready ? undefined : {
      header: reveal(elapsed - shellStart, headerTime, 16),
      dividers: reveal(elapsed - shellStart - headerTime, lineTime, 42),
      left: reveal(elapsed - columnsStart, columnTime, 24),
      right: reveal(elapsed - columnsStart - columnTime, columnTime, 24),
      archive: reveal(elapsed - columnsStart - 2 * columnTime, columnTime, 24),
    }} />;
  }

  return <TerminalFrame>
    <div className="boot-console" data-testid="boot-console" data-hold={elapsed >= logEnd || undefined} aria-label="正在启动">
      {lines.filter(line => elapsed >= line.start).map(line => {
        const count = Math.min(line.text.length, Math.floor((elapsed - line.start) * line.text.length / line.duration));
        return <div key={line.text} className={line.text.startsWith("[USER") ? "boot-user" : undefined}>
          {line.text.slice(0, count)}{count < line.text.length ? <span className="caret" aria-hidden="true" /> : null}
        </div>;
      })}
    </div>
  </TerminalFrame>;
}

export function TerminalMenu({ hasSave, onBegin }: { hasSave: boolean; onBegin: (entry: Entry) => void }) {
  const [selected, setSelected] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const items: { label: string; action: () => void }[] = [
    { label: "开始游戏", action: () => hasSave ? setConfirm(true) : onBegin("new") },
    ...(hasSave ? [{ label: "继续游戏", action: () => onBegin("resume") }] : []),
  ];
  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (confirm || event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return;
      const count = hasSave ? 2 : 1;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        target?.closest<HTMLButtonElement>(".menu-choice")?.blur();
        setSelected(value => (value + (event.key === "ArrowDown" ? 1 : -1) + count) % count);
      } else if (event.key === "Enter" && !event.repeat && !target?.closest("button")) {
        event.preventDefault();
        if (hasSave && selected === 1) onBegin("resume");
        else if (hasSave) setConfirm(true);
        else onBegin("new");
      }
    };
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [selected, confirm, hasSave, onBegin]);
  return <TerminalFrame>
    <header className="topbar ascii-rule title-bar">
      <span>[SYS] 双会话助手</span><span>{hasSave ? "[CTX] 已有存档" : "[LINK] 等待接入"}</span>
    </header>
    <div className="title-grid">
      <div className="terminal-menu">
        <div className="menu-system">/ 会话入口</div>
        <h1>He said,<br />she said<span aria-hidden="true">_</span></h1>
        <div className="menu-commands" aria-label="主菜单">
          {items.map((item, index) => <button type="button" key={item.label}
            className="menu-choice choice-line" data-current={selected === index || undefined}
            onMouseEnter={() => setSelected(index)} onFocus={() => setSelected(index)} onClick={item.action}>
            <span className="choice-cursor" aria-hidden="true">{selected === index ? ">" : ""}</span>{item.label}
          </button>)}
        </div>
      </div>
      <aside className="title-sessions" aria-label="会话入口信息">
        <div className="ascii-rule title-session-head">[LINK] 用户通道</div>
        {Object.values(terminalUsers).map(user => <div className="title-user" key={user.id}>
          <span className="title-id">[USER {user.id}]</span><b>{user.name}</b><span>待接入</span>
        </div>)}
        <div className="title-memory ascii-rule">
          <div>[MEM] 分窗记忆</div>
          <p>上下文独立 · 摘要按窗收录</p>
        </div>
      </aside>
    </div>
    <footer className="title-keys ascii-rule"><span>↑ ↓ 选择</span><span>Enter 确认</span></footer>
    {confirm ? <div className="overlay" role="dialog" aria-modal="true" aria-label="开始新游戏">
      <div className="dialog">
        <h2>开始新游戏？</h2><p>当前两条线的进度都会清空。</p>
        <div className="dialog-actions">
          <button type="button" autoFocus onClick={() => setConfirm(false)}>[取消]</button>
          <button type="button" onClick={() => onBegin("new")}>[开始新游戏]</button>
        </div>
      </div>
    </div> : null}
  </TerminalFrame>;
}
