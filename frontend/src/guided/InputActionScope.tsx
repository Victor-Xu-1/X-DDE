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
};
const Context = createContext<Scope | null>(null);

/** Serialize input replacement and submission within one form, not the job queue. */
export function InputActionScope({ children }: { children: ReactNode }) {
  const [action, setAction] = useState<Action | null>(null);
  const owner = useRef<symbol | null>(null),
    mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      owner.current = null;
    };
  }, []);
  const begin = useCallback((kind: Action) => {
    if (owner.current !== null) return null;
    const current = Symbol(kind);
    owner.current = current;
    setAction(kind);
    return () => {
      if (owner.current !== current) return;
      owner.current = null;
      if (mounted.current) setAction(null);
    };
  }, []);
  const scope = useMemo(() => ({ action, begin }), [action, begin]);
  return <Context.Provider value={scope}>{children}</Context.Provider>;
}

export function useInputActionScope() {
  return useContext(Context);
}
