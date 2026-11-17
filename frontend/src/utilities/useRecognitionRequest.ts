import { useEffect, useRef, useState, type RefObject } from "react";

type Phase = "idle" | "working" | "ready" | "failed";
export type RecognitionRequestError =
  "" | "recognition" | "recognitionTimeout" | "unsupported";
type Options = {
  id: string;
  origin: string;
  frame: RefObject<HTMLIFrameElement | null>;
  automatic: boolean;
  connected: boolean;
  valid: boolean;
  onReady(): void;
  onError(value: RecognitionRequestError): void;
};

/** Foreground protocol intent only. The native host still owns power and its job. */
export function useRecognitionRequest(options: Options) {
  const current = useRef(options);
  current.current = options;
  const [phase, setPhase] = useState<Phase>("idle");
  const [supported, setSupported] = useState<boolean | null>(null);
  const available = useRef(false),
    mounted = useRef(true),
    started = useRef(false);
  const pending = useRef<string | null>(null),
    completed = useRef<string | null>(null),
    applied = useRef<string | null>(null);
  const deadline = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function send(type: string, requestId: string) {
    const item = current.current;
    item.frame.current?.contentWindow?.postMessage(
      { type, id: item.id, requestId },
      item.origin,
    );
  }
  function cancel() {
    const id = pending.current;
    pending.current = null;
    clearTimeout(deadline.current);
    if (id) send("xdde-image:cancel", id);
  }
  function start() {
    if (!mounted.current || pending.current) return;
    if (!available.current) {
      current.current.onError("unsupported");
      return;
    }
    const requestId = crypto.randomUUID();
    started.current = true;
    completed.current = null;
    pending.current = requestId;
    current.current.onError("");
    setPhase("working");
    send("xdde-image:recognize", requestId);
    deadline.current = setTimeout(() => {
      if (pending.current !== requestId) return;
      cancel();
      if (mounted.current) {
        setPhase("failed");
        current.current.onError("recognitionTimeout");
      }
    }, 180000);
  }
  function receive(message: Record<string, unknown>) {
    if (!mounted.current) return;
    available.current = message.recognitionSupported === true;
    setSupported(available.current);
    if (!pending.current || message.recognitionRequestId !== pending.current)
      return;
    if (
      message.recognitionPhase !== "ready" &&
      message.recognitionPhase !== "failed"
    )
      return;
    clearTimeout(deadline.current);
    completed.current = pending.current;
    pending.current = null;
    setPhase(message.recognitionPhase);
    if (message.recognitionPhase === "failed")
      current.current.onError("recognition");
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancel();
    };
  }, []);
  useEffect(() => {
    if (options.automatic && options.connected && supported && !started.current)
      start();
  }, [options.automatic, options.connected, supported]);
  useEffect(() => {
    const id = completed.current;
    if (
      !options.automatic ||
      phase !== "ready" ||
      !options.valid ||
      !id ||
      applied.current === id
    )
      return;
    applied.current = id;
    current.current.onReady();
  }, [options.automatic, options.valid, phase]);
  return {
    phase,
    supported,
    start,
    receive,
    isAutomatic: () => current.current.automatic,
  };
}
