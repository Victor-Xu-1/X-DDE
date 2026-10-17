import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

/** Bootstrap only: the deadline and reload never control a scientific task. */
export function useViewerConnection(
  frame: RefObject<HTMLIFrameElement | null>,
  enabled: boolean,
) {
  const instance = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const [frameKey, setFrameKey] = useState(0);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const requestReady = useCallback(() => {
    frame.current?.contentWindow?.postMessage(
      { channel: "opendde-viewer", type: "ready-request", value: undefined },
      location.origin,
    );
  }, [frame]);
  const receiveReady = useCallback((detail: unknown) => {
    const identity =
      detail &&
      typeof detail === "object" &&
      "instanceId" in detail &&
      typeof detail.instanceId === "string"
        ? detail.instanceId
        : "";
    if (identity !== instance.current) {
      instance.current = identity;
      setRevision((value) => value + 1);
    }
    setFailed(false);
    setReady(true);
  }, []);
  const onLoad = useCallback(() => {
    setReady(false);
    setFailed(false);
    setLoadAttempt((value) => value + 1);
    requestReady();
  }, [requestReady]);
  const reload = useCallback(() => {
    instance.current = null;
    setReady(false);
    setFailed(false);
    setFrameKey((value) => value + 1);
  }, []);
  useEffect(requestReady, [requestReady, frameKey]);
  useEffect(() => {
    if (!enabled || ready) {
      setFailed(false);
      return;
    }
    const timer = window.setTimeout(() => setFailed(true), 30_000);
    return () => window.clearTimeout(timer);
  }, [enabled, ready, frameKey, loadAttempt]);
  return { ready, revision, frameKey, failed, receiveReady, onLoad, reload };
}
