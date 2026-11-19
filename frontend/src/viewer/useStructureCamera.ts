import { useEffect, type RefObject } from "react";
import {
  isStructureCamera,
  type StructureCamera,
  type StructureCameraHandle,
} from "./structure-camera";

/** A camera request is scoped to one loaded viewer instance and never carries structure data. */
export function useStructureCamera(
  frame: RefObject<HTMLIFrameElement | null>,
  sceneKey: string,
  loaded: boolean,
  publish?: (handle: StructureCameraHandle | null) => void,
) {
  useEffect(() => {
    const target = frame.current?.contentWindow;
    if (!publish || !loaded || !target) return;
    let closed = false;
    let pending: {
      id: string;
      timer: ReturnType<typeof setTimeout>;
      resolve(view: StructureCamera | null): void;
    } | null = null;
    function settle(camera: StructureCamera | null) {
      if (!pending) return;
      clearTimeout(pending.timer);
      const { resolve } = pending;
      pending = null;
      resolve(camera);
    }
    function receive(event: MessageEvent) {
      if (
        closed ||
        event.origin !== location.origin ||
        event.source !== target ||
        event.data?.channel !== "opendde-viewer" ||
        event.data.type !== "camera"
      )
        return;
      const reply = event.data.detail;
      if (pending && reply?.id === pending.id)
        settle(isStructureCamera(reply.camera) ? reply.camera : null);
    }
    function post(type: string, value: unknown) {
      target?.postMessage(
        { channel: "opendde-viewer", type, value },
        location.origin,
      );
    }
    window.addEventListener("message", receive);
    publish({
      read() {
        if (closed || pending) return Promise.resolve(null);
        return new Promise((resolve) => {
          const id = crypto.randomUUID();
          pending = {
            id,
            resolve,
            timer: setTimeout(() => settle(null), 1800),
          };
          post("camera-read", id);
        });
      },
      apply(camera) {
        if (!closed && isStructureCamera(camera)) post("camera-apply", camera);
      },
    });
    return () => {
      closed = true;
      window.removeEventListener("message", receive);
      settle(null);
      publish(null);
    };
  }, [frame, sceneKey, loaded, publish]);
}
