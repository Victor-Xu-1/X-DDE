import { useEffect, useRef, useState } from "react";
export function validSnapshot(
  value: unknown,
): value is { id: string; png: string } {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.png === "string" &&
    v.png.length <= 12 * 1024 ** 2 &&
    /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v.png)
  );
}
export function useViewerSnapshot(key: string) {
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
    clear();
    setImage("");
    setBusy(false);
    setFailed(false);
    return clear;
  }, [key]);
  function begin(send: (type: string, value?: unknown) => void) {
    clear();
    const id = crypto.randomUUID();
    pending.current = id;
    setBusy(true);
    setFailed(false);
    timer.current = setTimeout(() => {
      clear();
      setBusy(false);
      setFailed(true);
    }, 5000);
    send("snapshot", id);
  }
  function receive(value: unknown) {
    if (validSnapshot(value) && value.id === pending.current) {
      clear();
      setImage(value.png);
      setBusy(false);
    }
  }
  return { image, busy, failed, close, begin, receive };
}
