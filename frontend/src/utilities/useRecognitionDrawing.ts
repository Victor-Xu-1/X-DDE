import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { validImageMolecule, type ImageMolecule } from "./image-molecule";

export const drawingDestinations = {
  admet: ["ADMET 预测", "ADMET prediction"],
  brain: ["透脑评估", "Brain penetration"],
  properties: ["分子性质", "Molecular properties"],
  screen: ["作为筛查参照分子", "Similarity query"],
  states: ["质子化与互变异构", "Protonation & tautomers"],
} as const;
export type DrawingDestination = keyof typeof drawingDestinations;
export type EditorDrawing = { id: string; molecule: ImageMolecule };

type Request = {
  id: string;
  destination: DrawingDestination;
  timeout: ReturnType<typeof setTimeout>;
};

/** Publish only one drawing snapshot from the current companion document. */
export function useRecognitionDrawing(
  frame: RefObject<HTMLIFrameElement | null>,
  origin: string,
  active: boolean,
  onHandoff?: (destination: DrawingDestination, value: EditorDrawing) => void,
) {
  const route = useRef(onHandoff);
  route.current = onHandoff;
  const wake = useRef<(() => void) | null>(null);
  const send = useRef<((destination: DrawingDestination) => void) | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const connected = Boolean(onHandoff);
  useLayoutEffect(() => {
    setAvailable(null);
    setBusy(false);
    setFailed(false);
    if (!active || !connected) return;
    let session = crypto.randomUUID();
    let canExport = false;
    let pending: Request | null = null;
    function resetRequest() {
      if (pending) clearTimeout(pending.timeout);
      pending = null;
    }
    function connect() {
      frame.current?.contentWindow?.postMessage(
        { type: "xdde-drawing:connect", id: session },
        origin,
      );
    }
    function receive(event: MessageEvent) {
      if (
        event.origin !== origin ||
        event.source !== frame.current?.contentWindow
      )
        return;
      const data = event.data;
      if (data?.type === "xdde-drawing:ready") {
        connect();
        return;
      }
      if (!data || data.id !== session) return;
      if (
        data.type === "xdde-drawing:state" &&
        typeof data.available === "boolean"
      ) {
        canExport = data.available;
        setAvailable(canExport);
      }
      if (
        data.type !== "xdde-drawing:result" ||
        !pending ||
        pending.id !== data.requestId
      )
        return;
      const request = pending;
      resetRequest();
      setBusy(false);
      if (!validImageMolecule(data.molecule)) {
        setFailed(true);
        return;
      }
      route.current?.(request.destination, {
        id: request.id,
        molecule: data.molecule,
      });
    }
    wake.current = () => {
      session = crypto.randomUUID();
      canExport = false;
      resetRequest();
      setAvailable(null);
      setBusy(false);
      setFailed(false);
      connect();
    };
    send.current = (destination) => {
      const target = frame.current?.contentWindow;
      if (!target || !canExport || pending) return;
      const id = crypto.randomUUID();
      pending = {
        id,
        destination,
        timeout: setTimeout(() => {
          resetRequest();
          setBusy(false);
          setFailed(true);
        }, 15000),
      };
      setBusy(true);
      setFailed(false);
      target.postMessage(
        { type: "xdde-drawing:export", id: session, requestId: id },
        origin,
      );
    };
    window.addEventListener("message", receive);
    connect();
    return () => {
      window.removeEventListener("message", receive);
      resetRequest();
      wake.current = null;
      send.current = null;
    };
  }, [active, connected, frame, origin]);
  return {
    available,
    busy,
    failed,
    connect: () => wake.current?.(),
    send: (destination: DrawingDestination) => send.current?.(destination),
  };
}
