import { useEffect, useRef, useState } from "react";
import type { Language } from "../types";
import {
  recognitionOrigin,
  validImage,
  validImageMolecule,
  type ImageMolecule,
} from "./image-molecule";

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
    [error, setError] = useState("");
  const request = useRef<string | null>(null),
    mounted = useRef(true);
  const callback = useRef(onAccept);
  callback.current = onAccept;
  const deadline = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const zh = language === "zh",
    origin = recognitionOrigin();
  function connect() {
    frame.current?.contentWindow?.postMessage(
      { type: "xdde-image:connect", id, file },
      origin,
    );
  }
  useEffect(() => {
    mounted.current = true;
    const loading = setTimeout(() => {
      if (mounted.current)
        setError(
          zh
            ? "尚未连接图片识别工作台，请确认它已打开并支持任务导入。"
            : "The image workbench has not connected. Open a compatible local workbench and retry.",
        );
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
        console.warn("Recognition export rejected", {
          structure: Boolean(message.molecule),
          schema: validImageMolecule(message.molecule),
          sourceFile: message.source instanceof File,
          image: message.source instanceof File && validImage(message.source),
          smilesType: typeof message.molecule?.smiles,
          molfileType: typeof message.molecule?.molfile,
          molfileEnd:
            typeof message.molecule?.molfile === "string" &&
            /^M  END\s*$/m.test(message.molecule.molfile),
          multipleRecords:
            typeof message.molecule?.molfile === "string" &&
            message.molecule.molfile.includes("$$$$"),
        });
        setBusy(false);
        setError(
          zh
            ? "尚无可用结构，请完成识别并核对结构后再试。"
            : "No usable structure. Recognize and review the molecule, then retry.",
        );
        return;
      }
      try {
        await callback.current(message.molecule, message.source);
      } catch {
        if (mounted.current)
          setError(
            zh
              ? "无法将结构带入任务，请重试。"
              : "The structure could not be transferred. Retry.",
          );
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
  }, [id, origin, zh]);
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
      setError(
        zh ? "结构读取超时，请重试。" : "Structure export timed out. Retry.",
      );
    }, 15000);
  }
  return {
    frame,
    connected,
    valid,
    busy,
    error,
    connect,
    accept,
    origin,
    filename,
  };
}
