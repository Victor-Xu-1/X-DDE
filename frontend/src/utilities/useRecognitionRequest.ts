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
  const [serviceReady, setServiceReady] = useState(false);
  const available = useRef(false),
    ready = useRef(false),
    mounted = useRef(true),
    started = useRef(false);
  const pending = useRef<string | null>(null),
    completed = useRef<string | null>(null),
    applied = useRef<string | null>(null);
  const deadline = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const destination = useRef<Window | null>(null);
  function send(type: string, requestId: string) {
    const item = current.current;
    // React clears the iframe ref before passive cleanup. Keep its exact target
    // so closing a dialog can still revoke the current native import lease.
    destination.current =
      item.frame.current?.contentWindow ?? destination.current;
    destination.current?.postMessage(
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
    if (!ready.current) return;
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
    if (typeof message.recognitionServiceReady === "boolean") {
      ready.current = message.recognitionServiceReady;
      setServiceReady(ready.current);
    }
    available.current =
      message.recognitionSupported === true &&
      typeof message.recognitionServiceReady === "boolean";
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
    if (
      options.automatic &&
      options.connected &&
      supported &&
      serviceReady &&
      !options.valid &&
      !started.current
    )
      start();
  }, [
    options.automatic,
    options.connected,
    options.valid,
    supported,
    serviceReady,
  ]);
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
    serviceReady,
    start,
    receive,
    isAutomatic: () => current.current.automatic,
  };
}
