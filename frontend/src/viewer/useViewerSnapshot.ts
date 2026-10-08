import { useEffect, useRef, useState } from "react";
import type { FigureSettings } from "../publication/settings";
import { dataUrlBlob } from "../publication/png-resolution";
export function validSnapshot(
  value: unknown,
): value is { id: string; png: string } {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.png === "string" &&
    v.png.length <= 64 * 1024 ** 2 &&
    /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v.png)
  );
}
export function useViewerSnapshot(key: string) {
  const promise = useRef<{
    resolve(blob: Blob): void;
    reject(error: Error): void;
  } | null>(null);
  const pending = useRef<string | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [image, setImage] = useState(""),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  function close() {
    setImage("");
  }
  function clear() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
  }
  useEffect(() => {
    promise.current?.reject(
      new Error("The structure changed during figure export."),
    );
    promise.current = null;
    clear();
    setImage("");
    setBusy(false);
    setFailed(false);
    return () => {
      promise.current?.reject(
        new Error("The view closed during figure export."),
      );
      promise.current = null;
      clear();
    };
  }, [key]);
  function begin(send: (type: string, value?: unknown) => void, scale = 2) {
    if (pending.current) return;
    clear();
    setImage("");
    const id = crypto.randomUUID();
    pending.current = id;
    setBusy(true);
    setFailed(false);
    timer.current = setTimeout(() => {
      clear();
      setBusy(false);
      setFailed(true);
    }, 5000);
    send("snapshot", { id, scale });
  }
  function receive(value: unknown) {
    if (
      value &&
      typeof value === "object" &&
      (value as Record<string, unknown>).id === pending.current &&
      (value as Record<string, unknown>).png === null
    ) {
      clear();
      setBusy(false);
      setFailed(true);
      promise.current?.reject(new Error("Native figure rendering failed."));
      promise.current = null;
      return;
    }
    if (validSnapshot(value) && value.id === pending.current) {
      clear();
      if (!promise.current) setImage(value.png);
      setBusy(false);
      const waiting = promise.current;
      promise.current = null;
      if (waiting)
        void dataUrlBlob(value.png).then(waiting.resolve, waiting.reject);
    }
  }
  function figure(
    send: (type: string, value?: unknown) => void,
    settings: FigureSettings,
  ): Promise<Blob> {
    if (pending.current)
      return Promise.reject(new Error("A figure is already being rendered."));
    clear();
    const id = crypto.randomUUID();
    pending.current = id;
    setBusy(true);
    setFailed(false);
    return new Promise((resolve, reject) => {
      promise.current = { resolve, reject };
      timer.current = setTimeout(() => {
        clear();
        promise.current = null;
        setBusy(false);
        setFailed(true);
        reject(new Error("Native figure export timed out."));
      }, 30000);
      send("snapshot", { id, figure: settings });
    });
  }
  return { image, busy, failed, close, begin, figure, receive };
}
