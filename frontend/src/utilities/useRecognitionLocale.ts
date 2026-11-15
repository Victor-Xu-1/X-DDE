import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { RecognitionLanguage } from "./recognition-locale";

/** Language changes leave the iframe node, source URL and chemical state intact. */
export function useRecognitionLocale(
  frame: RefObject<HTMLIFrameElement | null>,
  origin: string,
  language: RecognitionLanguage,
  active = true,
) {
  const current = useRef(language);
  current.current = language;
  const [supported, setSupported] = useState<boolean | null>(null);
  const request = useRef<string | null>(null);
  const deadline = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const connect = useCallback(() => {
    if (!frame.current?.contentWindow) return;
    clearTimeout(deadline.current);
    const id = crypto.randomUUID();
    request.current = id;
    setSupported(null);
    frame.current.contentWindow.postMessage(
      { type: "xdde-locale:set", version: 1, id, language: current.current },
      origin,
    );
    deadline.current = setTimeout(() => setSupported(false), 5000);
  }, [frame, origin]);
  useEffect(() => {
    if (!active) return;
    function receive(event: MessageEvent) {
      if (
        event.origin !== origin ||
        event.source !== frame.current?.contentWindow
      )
        return;
      const data = event.data;
      if (!data || data.version !== 1) return;
      if (data.type === "xdde-locale:ready") {
        connect();
      } else if (
        data.type === "xdde-locale:applied" &&
        data.id === request.current &&
        data.language === current.current
      ) {
        clearTimeout(deadline.current);
        setSupported(true);
      }
    }
    window.addEventListener("message", receive);
    return () => {
      window.removeEventListener("message", receive);
      clearTimeout(deadline.current);
      request.current = null;
    };
  }, [active, connect, frame, origin]);
  useEffect(() => {
    if (active) connect();
  }, [active, language, connect]);
  return { connect, supported };
}
