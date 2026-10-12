import { useEffect, useRef, useState } from "react";
import {
  FigureRenderQueue,
  figureIdentity,
  figureRequestKey,
} from "./figure-render-queue";
import { pngResolution } from "./png-resolution";
import type { FigureSettings } from "./settings";
import { figureDataUrl } from "./figure-data-url";

interface Preview {
  key: string;
  id: number;
  url: string;
  blob: Blob;
  decoded: boolean;
}
/** The preview and the download are the same validated native bytes. */
export function useFigurePreview({
  settings,
  sourceKey,
  format,
  valid,
  render,
  onStart,
}: {
  settings: FigureSettings;
  sourceKey: string;
  format: "png" | "svg";
  valid: boolean;
  render(settings: FigureSettings): Promise<Blob>;
  onStart?(): void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [failure, setFailure] = useState<{
      key: string;
      layout: boolean;
    } | null>(null),
    [attempt, setAttempt] = useState(0);
  const session = useRef<FigureRenderQueue | null>(null);
  const serial = useRef(0),
    activeId = useRef<number | null>(null);
  if (!session.current) session.current = new FigureRenderQueue();
  const source = {
    key: figureIdentity(sourceKey, format),
    onStart,
    render: async (value: FigureSettings) => {
      const native = await render(value);
      if (
        native.type !== (format === "png" ? "image/png" : "image/svg+xml") ||
        !native.size ||
        native.size > 64 * 1024 ** 2
      )
        throw new Error("Invalid native figure.");
      return format === "png" ? pngResolution(native, value.dpi) : native;
    },
  };
  const key = figureRequestKey(source.key, settings);
  useEffect(() => {
    const controller = new AbortController();
    setPreview(null);
    setFailure(null);
    activeId.current = null;
    if (!valid) return () => controller.abort();
    const requested = { ...settings };
    const requestedSource = source;
    const timer = setTimeout(() => {
      void session
        .current!.request(requested, requestedSource, controller.signal)
        .then(async (blob) => {
          if (controller.signal.aborted) return;
          const next = await figureDataUrl(blob, controller.signal);
          if (controller.signal.aborted) return;
          const id = ++serial.current;
          activeId.current = id;
          setPreview({ key, id, url: next, blob, decoded: false });
        })
        .catch((cause: unknown) => {
          if (!controller.signal.aborted) {
            console.warn("Native figure preview unavailable.", cause);
            setFailure({
              key,
              layout:
                cause instanceof Error && cause.name === "MolecularLayoutError",
            });
          }
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
      activeId.current = null;
    };
  }, [key, valid, attempt]);
  const current = valid && preview?.key === key ? preview : null;
  const error = valid && failure?.key === key;
  return {
    preview: current,
    error,
    layoutError: Boolean(error && failure?.layout),
    ready: !!current?.decoded && !error,
    decoded: (readyId: number) =>
      setPreview((value) =>
        value?.id === readyId ? { ...value, decoded: true } : value,
      ),
    failed: (failedId: number) => {
      if (activeId.current !== failedId) return;
      console.warn("Native figure preview could not be decoded.");
      activeId.current = null;
      setPreview(null);
      setFailure({ key, layout: false });
    },
    retry: () => setAttempt((value) => value + 1),
  };
}
