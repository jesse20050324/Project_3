import { useEffect, useMemo, useReducer } from "react";
import { createReducer } from "./engine/reducer";
import { createInitial } from "./engine/scheduler";
import { loadProgress, saveProgress } from "./engine/storage";
import type { Beat } from "./engine/types";

export function useEngine(beats: Beat[]) {
  const reducer = useMemo(() => createReducer(beats), [beats]);
  const [state, dispatch] = useReducer(reducer, beats, (initial) => loadProgress(initial) ?? createInitial(initial));

  useEffect(() => {
    dispatch({ type: "sync-roots" });
  }, [beats, state.activated, state.completed, dispatch]);

  useEffect(() => {
    saveProgress(state);
  }, [state]);

  return { state, dispatch };
}
