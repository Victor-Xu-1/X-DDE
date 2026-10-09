import { useEffect, useRef, useState } from "react";
import { FigureRenderQueue, figureKey } from "./figure-render-queue";
import { pngResolution } from "./png-resolution";
import type { FigureSettings } from "./settings";

interface Preview {
  key: string;
  url: string;
  blob: Blob;
  decoded: boolean;
}
/** The preview and the download are the same validated native bytes. */
export function useFigurePreview({
  settings,
  format,
  valid,
  render,
  onStart,
}: {
  settings: FigureSettings;
  format: "png" | "svg";
  valid: boolean;
  render(settings: FigureSettings): Promise<Blob>;
  onStart?(): void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState(false),
    [attempt, setAttempt] = useState(0);
  const session = useRef<FigureRenderQueue | null>(null);
  const url = useRef<string | null>(null);
  if (!session.current)
    session.current = new FigureRenderQueue(async (value) => {
      const native = await render(value);
      if (
        native.type !== (format === "png" ? "image/png" : "image/svg+xml") ||
        !native.size ||
        native.size > 64 * 1024 ** 2
      )
        throw new Error("Invalid native figure.");
      return format === "png" ? pngResolution(native, value.dpi) : native;
    }, onStart);
  const key = figureKey(settings);
  useEffect(() => {
    const controller = new AbortController();
    setPreview(null);
    setError(false);
    if (url.current) {
      URL.revokeObjectURL(url.current);
      url.current = null;
    }
    if (!valid) return () => controller.abort();
    const requested = { ...settings };
    const timer = setTimeout(() => {
      void session
        .current!.request(requested, controller.signal)
        .then((blob) => {
          if (controller.signal.aborted) return;
          const next = URL.createObjectURL(blob);
          url.current = next;
          setPreview({ key, url: next, blob, decoded: false });
        })
        .catch(() => {
          if (!controller.signal.aborted) setError(true);
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
      if (url.current) {
        URL.revokeObjectURL(url.current);
        url.current = null;
      }
    };
  }, [key, valid, attempt]);
  const current = preview?.key === key ? preview : null;
  return {
    preview: current,
    error,
    ready: !!current?.decoded && !error,
    decoded: (readyUrl: string) =>
      setPreview((value) =>
        value?.url === readyUrl ? { ...value, decoded: true } : value,
      ),
    failed: (failedUrl: string) => {
      if (url.current !== failedUrl) return;
      URL.revokeObjectURL(failedUrl);
      url.current = null;
      setPreview(null);
      setError(true);
    },
    retry: () => setAttempt((value) => value + 1),
  };
}
