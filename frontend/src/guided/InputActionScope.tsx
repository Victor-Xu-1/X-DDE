import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Job } from "../types";

type Action = "example" | "submission" | "structure-import";
type Scope = {
  action: Action | null;
  begin(action: Action): (() => void) | null;
  isLocked(action?: Action): boolean;
  currentSignal(): AbortSignal;
  onDetachedAccept?(job: Job): void;
};
const Context = createContext<Scope | null>(null);

/** Serialize input replacement and submission within one form, not the job queue. */
export function useInputActionController() {
  const [action, setAction] = useState<Action | null>(null);
  const owner = useRef<{ token: symbol; action: Action } | null>(null),
    mounted = useRef(true);
  const generation = useRef(new AbortController());
  useLayoutEffect(() => {
    mounted.current = true;
    if (generation.current.signal.aborted)
      generation.current = new AbortController();
    return () => {
      mounted.current = false;
      generation.current.abort();
      owner.current = null;
    };
  }, []);
  const begin = useCallback((kind: Action) => {
    if (!mounted.current || owner.current !== null) return null;
    const current = Symbol(kind);
    owner.current = { token: current, action: kind };
    generation.current.abort();
    generation.current = new AbortController();
    setAction(kind);
    return () => {
      if (owner.current?.token !== current) return;
      generation.current.abort();
      owner.current = null;
      generation.current = new AbortController();
      if (mounted.current) setAction(null);
    };
  }, []);
  const isLocked = useCallback(
    (kind?: Action) =>
      owner.current !== null && (!kind || owner.current.action === kind),
    [],
  );
  const currentSignal = useCallback(() => generation.current.signal, []);
  return useMemo(
    () => ({ action, begin, isLocked, currentSignal }),
    [action, begin, isLocked, currentSignal],
  );
}

export function InputActionScope({ children }: { children: ReactNode }) {
  const scope = useInputActionController();
  return <InputActionProvider value={scope}>{children}</InputActionProvider>;
}

export function InputActionProvider({
  value,
  children,
}: {
  value: Scope;
  children: ReactNode;
}) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useInputActionScope() {
  return useContext(Context);
}
