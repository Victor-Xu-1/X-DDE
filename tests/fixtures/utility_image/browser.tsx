/** Controlled two-origin image transport only; no OCR, model or scientific output. */
import "../../../frontend/src/utilities/utility-task.css";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  UtilityImageInput,
  type UtilityImageValue,
} from "../../../frontend/src/utilities/UtilityImageInput";
import { TaskPresentationContext } from "../../../frontend/src/guided/TaskPresentation";
import {
  attachRecognitionBridge,
  drawingBridgeOrigin,
  inputBridgeOrigin,
  type RecognitionHost,
} from "../../../frontend/src/utilities/recognition-host-bridge";
import { UtilityWorkspace } from "../../../frontend/src/utilities/UtilityWorkspace";
const molecule = {
  smiles: "Nc1ccccc1",
  molfile: "Controlled protocol fixture\nM  END\n",
};

function Parent() {
  const [value, setValue] = useState<UtilityImageValue | null>(null);
  const [query, setQuery] = useState<UtilityImageValue | null>(null);
  const [active, setActive] = useState(true);
  return (
    <main
      style={{ maxWidth: 900, margin: "24px auto", fontFamily: "sans-serif" }}
    >
      <h1>Controlled image input contract</h1>
      <p>This page checks transport, not chemical recognition.</p>
      <button onClick={() => setActive(!active)}>Toggle active tool</button>
      <TaskPresentationContext.Provider
        value={{
          layout: "single",
          active,
          imageEntry: "workspace",
          renderResult: () => null,
        }}
      >
        <UtilityImageInput
          active={active}
          language="en"
          value={value?.reference.asset_id ?? ""}
          onLoaded={setValue}
        >
          <label>
            Primary draft
            <textarea aria-label="Primary draft" defaultValue="Keep my draft" />
          </label>
          <output aria-label="Primary input">
            {value?.reference.asset_id ?? "Empty"}
          </output>
          <UtilityImageInput
            active={active}
            language="en"
            target="query"
            value={query?.reference.asset_id ?? ""}
            onLoaded={setQuery}
          >
            <label>
              Query draft
              <textarea
                aria-label="Query draft"
                defaultValue="Keep query draft"
              />
            </label>
            <output aria-label="Query input">
              {query?.reference.asset_id ?? "Empty"}
            </output>
          </UtilityImageInput>
        </UtilityImageInput>
      </TaskPresentationContext.Provider>
    </main>
  );
}
function NativeHost() {
  const [file, setFile] = useState<File | null>(null),
    [graph, setGraph] = useState<typeof molecule | null>(null);
  const [count, setCount] = useState(0);
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const read = new AbortController();
    void fetch("/api/utilities/recognition?include_power=true", {
      signal: read.signal,
    })
      .then((response) => response.json())
      .then((state) => setEnabled(state.power.enabled))
      .catch((error) => {
        if (!read.signal.aborted) throw error;
      });
    return () => read.abort();
  }, []);
  const current = useRef({ file, graph, enabled });
  current.current = { file, graph, enabled };
  const changed = useRef(() => {}),
    bridge = useRef<ReturnType<typeof attachRecognitionBridge> | null>(null);
  useEffect(() => {
    const drawing = drawingBridgeOrigin();
    const origin = drawing ?? inputBridgeOrigin();
    if (!origin) return;
    const host: RecognitionHost = {
      selectFile: async (next) => {
        setGraph(null);
        setFile(next);
        return true;
      },
      file: () => current.current.file,
      available: () => Boolean(current.current.graph),
      molecule: async () => current.current.graph!,
      subscribe: (callback) => {
        changed.current = callback;
        return () => {};
      },
      recognitionReady: () => current.current.enabled,
      recognize: async () => {
        setCount((n) => n + 1);
        setGraph(molecule);
      },
      loadMolecule: (value) => setGraph(value),
    };
    bridge.current = attachRecognitionBridge(
      host,
      origin,
      drawing ? "drawing" : "input",
    );
    return () => bridge.current?.dispose();
  }, []);
  useEffect(() => {
    changed.current();
    bridge.current?.publish();
  }, [file, graph, enabled]);
  return (
    <main>
      <h1>Controlled native host</h1>
      <button
        type="button"
        role="switch"
        aria-label="Recognition backend"
        aria-checked={enabled}
        onClick={async () => {
          const action = enabled ? "stop" : "start";
          const response = await fetch(`/api/utilities/recognition/${action}`, {
            method: "POST",
          });
          const state = await response.json();
          setEnabled(state.power.enabled);
        }}
      >
        {enabled ? "On" : "Off"}
      </button>
      <output aria-label="OCR calls">{count}</output>
      <label>
        Replace image
        <input
          type="file"
          accept="image/png"
          onChange={(event) => {
            setGraph(null);
            setFile(event.currentTarget.files?.[0] ?? null);
          }}
        />
      </label>
      <label>
        Graph text
        <input
          value={graph?.smiles ?? ""}
          onChange={(event) =>
            setGraph({
              smiles: event.target.value,
              molfile: event.target.value + "\nM  END\n",
            })
          }
        />
      </label>
      <p>Recognition is simulated; no model is loaded.</p>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  location.port === "8940" ? (
    <NativeHost />
  ) : new URLSearchParams(location.search).get("audit") === "drawing" ? (
    <UtilityWorkspace
      language="en"
      onCreated={() => {
        throw Error("Unexpected task");
      }}
    />
  ) : (
    <Parent />
  ),
);
