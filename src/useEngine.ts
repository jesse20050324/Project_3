import { useEffect, useMemo, useReducer, useState } from "react";
import { createReducer } from "./engine/reducer";
import { createInitial, playbackStep } from "./engine/scheduler";
import { consumeLoadNotice, loadProgress, saveProgress } from "./engine/storage";
import type { Channel, Script } from "./engine/types";

export function useEngine(script: Script) {
  const beats = script.beats;
  const reducer = useMemo(() => createReducer(beats), [beats]);
  const [state, dispatch] = useReducer(reducer, beats, (initial) => loadProgress(initial) ?? createInitial(initial));
  const [notice] = useState(() => consumeLoadNotice());

  // 存档只写一次；读档与兼容归一化都在 storage.ts 里一次性完成。
  // 旧版每次渲染都 dispatch sync-roots 的运行时补丁已移除。
  useEffect(() => {
    saveProgress(state);
  }, [state]);

  // 运行时错误仍可追踪，但不在画面上展示（界面已不提供任何调试类 UI）。
  useEffect(() => {
    if (state.error) console.error(state.error);
  }, [state.error]);

  // 跨章仪式由持久化状态驱动：刷新/StrictMode 双调用都能按 until 恢复，
  // 不再依赖组件局部 state + 定时器（那正是「章间必须刷新才能继续」的根因）。
  useEffect(() => {
    const now = Date.now();
    const due = (["left", "right"] as Channel[]).filter((channel) => {
      const ritual = state.ritual[channel];
      return ritual !== null && ritual.until <= now;
    });
    if (due.length > 0) {
      for (const channel of due) dispatch({ type: "ritual-tick", channel, now });
      return;
    }
    const pending = (["left", "right"] as Channel[])
      .map((channel) => state.ritual[channel]?.until)
      .filter((until): until is number => until !== undefined);
    if (pending.length === 0) return;
    const next = Math.min(...pending);
    const timer = window.setTimeout(() => {
      const tick = Date.now();
      for (const channel of ["left", "right"] as Channel[]) {
        if (state.ritual[channel] && state.ritual[channel]!.until <= tick) {
          dispatch({ type: "ritual-tick", channel, now: tick });
        }
      }
    }, Math.max(0, next - now));
    return () => window.clearTimeout(timer);
  }, [state.ritual]);

  // 唯一的开演决策点：按剧本排序键选下一个该播的窗。
  useEffect(() => {
    const step = playbackStep(state, beats);
    if (step) dispatch({ type: "arm", channel: step.channel });
  }, [state, beats]);

  return { state, dispatch, notice };
}
