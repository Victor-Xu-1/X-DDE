import { useEffect, useReducer, useRef } from "react";

type NativeFrame = { source: string; signature: string | null };

/** Track the actual queued renderer, including redraws superseded by new props. */
export function usePlotFrame(source: string, signature: string) {
  const native = useRef<NativeFrame | null>(null);
  const mounted = useRef(true);
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function publish(value: NativeFrame | null) {
    native.current = value;
    if (mounted.current) refresh();
  }

  return {
    visible: native.current?.source === source,
    ready:
      native.current?.source === source &&
      native.current.signature === signature,
    begin() {
      publish(
        native.current?.source === source ? { source, signature: null } : null,
      );
    },
    complete() {
      publish({ source, signature });
    },
    invalidate() {
      publish(null);
    },
  };
}
