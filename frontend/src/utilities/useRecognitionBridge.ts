import { useEffect, useRef, useState } from "react";
import type { Language } from "../types";
import {
  recognitionOrigin,
  validImage,
  validImageMolecule,
  type ImageMolecule,
} from "./image-molecule";

const messages = {
  connect: [
    "尚未连接图片识别工作台，请确认它已打开并支持任务导入。",
    "The image workbench has not connected. Open a compatible local workbench and retry.",
  ],
  molecule: [
    "尚无可用结构，请完成识别并核对结构后再试。",
    "No usable structure. Recognize and review the molecule, then retry.",
  ],
  transfer: [
    "无法将结构带入任务，请重试。",
    "The structure could not be transferred. Retry.",
  ],
  timeout: ["结构读取超时，请重试。", "Structure export timed out. Retry."],
};

export function useRecognitionBridge(
  file: File,
  language: Language,
  onAccept: (value: ImageMolecule, source: File) => Promise<void> | void,
) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [id] = useState(() => crypto.randomUUID());
  const [filename, setFilename] = useState(file.name);
  const [connected, setConnected] = useState(false),
    [valid, setValid] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<keyof typeof messages | "">("");
  const request = useRef<string | null>(null),
    mounted = useRef(true);
  const callback = useRef(onAccept);
  callback.current = onAccept;
  const deadline = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const origin = recognitionOrigin();
  function connect() {
    frame.current?.contentWindow?.postMessage(
      { type: "xdde-image:connect", id, file },
      origin,
    );
  }
  useEffect(() => {
    mounted.current = true;
    const loading = setTimeout(() => {
      if (mounted.current) setError("connect");
    }, 15000);
    async function receive(event: MessageEvent) {
      if (
        event.origin !== origin ||
        event.source !== frame.current?.contentWindow
      )
        return;
      const message = event.data;
      if (!message || typeof message !== "object") return;
      if (message.type === "xdde-image:ready") {
        connect();
        return;
      }
      if (message.id !== id) return;
      if (message.type === "xdde-image:state") {
        clearTimeout(loading);
        setConnected(true);
        setError("");
        setValid(message.valid === true);
        if (
          typeof message.filename === "string" &&
          message.filename.length <= 255
        )
          setFilename(message.filename);
        return;
      }
      if (
        message.type !== "xdde-image:result" ||
        !request.current ||
        message.requestId !== request.current
      )
        return;
      clearTimeout(deadline.current);
      request.current = null;
      if (
        !validImageMolecule(message.molecule) ||
        !(message.source instanceof File) ||
        !validImage(message.source)
      ) {
        setBusy(false);
        setError("molecule");
        return;
      }
      try {
        await callback.current(message.molecule, message.source);
      } catch {
        if (mounted.current) setError("transfer");
      } finally {
        if (mounted.current) setBusy(false);
      }
    }
    window.addEventListener("message", receive);
    return () => {
      mounted.current = false;
      request.current = null;
      clearTimeout(loading);
      clearTimeout(deadline.current);
      window.removeEventListener("message", receive);
    };
  }, [id, origin]);
  function accept() {
    if (busy || !valid || !connected) return;
    const requestId = crypto.randomUUID();
    request.current = requestId;
    setBusy(true);
    setError("");
    frame.current?.contentWindow?.postMessage(
      { type: "xdde-image:export", id, requestId },
      origin,
    );
    deadline.current = setTimeout(() => {
      request.current = null;
      setBusy(false);
      setError("timeout");
    }, 15000);
  }
  return {
    frame,
    connected,
    valid,
    busy,
    error: error ? messages[error][language === "zh" ? 0 : 1] : "",
    connect,
    accept,
    origin,
    filename,
  };
}
