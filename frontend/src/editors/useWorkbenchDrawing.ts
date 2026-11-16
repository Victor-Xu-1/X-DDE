import { useEffect, useRef, useState, type RefObject } from "react";
import { editorReady, type Ketcher } from "./scientificEditor";
import {
  configureRecognitionEditor as configureDrawing,
  createMolecularViewport,
  type RecognitionEditor,
} from "./recognition-host-editor";
import { moleculeReadiness } from "./molecule-readiness";
import { drawingVisibility } from "./drawing-visibility";

type WorkbenchEditor = RecognitionEditor & {
  getMolfile(format: "v3000"): Promise<string>;
};

/** The workbench and image input share one native drawing/identity authority. */
export function useWorkbenchDrawing(
  frame: RefObject<HTMLIFrameElement | null>,
  generation: number,
  visible: boolean,
) {
  const approval = useRef(moleculeReadiness());
  const current = useRef<{
    native: WorkbenchEditor;
    policy: ReturnType<typeof configureDrawing>;
    reject(): void;
  } | null>(null);
  const [state, setState] = useState({
    ready: false,
    busy: false,
    available: false,
  });
  const [needsPreparation, setNeedsPreparation] = useState(false);
  useEffect(() => {
    if (!generation) return;
    const controller = new AbortController();
    current.current = null;
    approval.current.update(false);
    setState({ ready: false, busy: true, available: false });
    setNeedsPreparation(false);
    void editorReady(frame.current, controller.signal)
      .then((editor) => {
        controller.signal.throwIfAborted();
        const native = editor as WorkbenchEditor;
        if (
          !native.getKet ||
          !native.eventBus ||
          !native.structService?.getInChIKey
        )
          throw new Error(
            "Update the drawing component to validate molecular identity.",
          );
        const document = frame.current?.contentDocument;
        if (!document)
          throw new Error("The native drawing document is unavailable.");
        const visibility = drawingVisibility(document);
        controller.signal.addEventListener(
          "abort",
          () => visibility.dispose(),
          { once: true },
        );
        let unsafe = true;
        visibility.show(false);
        const viewport = createMolecularViewport(native.editor);
        const policy = configureDrawing(
          native,
          controller.signal,
          () => {
            if (!controller.signal.aborted) {
              unsafe = true;
              visibility.show(false);
              setNeedsPreparation(true);
            }
          },
          {
            fit: viewport.fit,
            resetZoom: viewport.resetZoom,
            onState: (next) => {
              if (controller.signal.aborted) return;
              visibility.show(!next.busy && !unsafe);
              approval.current.update(next.available);
              setState({ ready: true, ...next });
            },
            onValidated: () => {
              if (!controller.signal.aborted) {
                unsafe = false;
                visibility.show(true);
                setNeedsPreparation(false);
              }
            },
          },
        );
        current.current = {
          native,
          policy,
          reject: () => {
            if (controller.signal.aborted) return;
            unsafe = true;
            visibility.show(false);
            approval.current.update(false);
            setNeedsPreparation(true);
            setState({ ready: true, busy: false, available: false });
          },
        };
        const observer = new ResizeObserver((entries) => {
          const size = entries[0]?.contentRect;
          if (size) policy.resize(size.width, size.height);
        });
        if (frame.current) observer.observe(frame.current);
        controller.signal.addEventListener(
          "abort",
          () => observer.disconnect(),
          { once: true },
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          approval.current.update(false);
          setNeedsPreparation(true);
          setState({ ready: false, busy: false, available: false });
        }
      });
    return () => {
      controller.abort();
      current.current = null;
      approval.current.update(false);
    };
  }, [frame, generation]);
  useEffect(() => {
    if (visible) current.current?.policy.fitWhenVisible();
  }, [visible, state.ready]);

  function activeEditor() {
    try {
      return (
        frame.current?.contentWindow as (Window & { ketcher?: Ketcher }) | null
      )?.ketcher;
    } catch {
      return undefined;
    }
  }
  function connected() {
    const value = current.current;
    if (!value || activeEditor() !== value.native)
      throw new Error(
        "The editor changed. Wait for it to reconnect and retry.",
      );
    return value;
  }
  type Connection = NonNullable<typeof current.current>;
  async function read(method: "getSmiles" | "getMolfile", value: Connection) {
    if (connected() !== value)
      throw new Error("The editor changed during export. Retry.");
    const checkpoint = approval.current.checkpoint();
    const result =
      method === "getMolfile"
        ? await value.native.getMolfile("v3000")
        : await value.native.getSmiles();
    approval.current.verify(checkpoint);
    if (connected() !== value)
      throw new Error("The editor changed during export. Retry.");
    return result;
  }
  async function open(source: string, value = connected()) {
    if (connected() !== value)
      throw new Error("The editor changed while opening. Retry.");
    try {
      if (!(await value.policy.load(source)) || connected() !== value)
        throw new Error(
          "The drawing changed while opening. Reopen the file to retry.",
        );
    } catch (error) {
      // A rejected current import retains a drawing even without a native
      // change event. Expose explicit recovery; never mark a newer frame bad.
      if (current.current === value && activeEditor() === value.native)
        value.reject();
      throw error;
    }
  }
  return {
    ...state,
    needsPreparation,
    open,
    async prepare() {
      const value = connected();
      if (!(await value.policy.recheck()) || connected() !== value)
        throw new Error(
          "The drawing changed during preparation. Review it and retry.",
        );
    },
    editor(): Ketcher {
      const value = connected();
      return {
        getSmiles: () => read("getSmiles", value),
        getMolfile: () => read("getMolfile", value),
        setMolecule: (source) => open(source, value),
      };
    },
  };
}
