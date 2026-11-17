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

type Action = "example" | "submission";
type Scope = {
  action: Action | null;
  begin(action: Action): (() => void) | null;
  isLocked(action?: Action): boolean;
  currentSignal(): AbortSignal;
};
const Context = createContext<Scope | null>(null);

/** Serialize input replacement and submission within one form, not the job queue. */
export function InputActionScope({ children }: { children: ReactNode }) {
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
  const scope = useMemo(
    () => ({ action, begin, isLocked, currentSignal }),
    [action, begin, isLocked, currentSignal],
  );
  return <Context.Provider value={scope}>{children}</Context.Provider>;
}

export function useInputActionScope() {
  return useContext(Context);
}
