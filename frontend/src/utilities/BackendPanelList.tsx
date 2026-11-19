import { useState } from "react";
import { tools } from "../operations/catalog";
import type { Language } from "../types";
import type { useBackendRuntime } from "./backend-runtime";
import {
  computeActivity,
  ComputeSwitch,
  useComputePower,
} from "./ComputeSwitch";
import { RecognitionBackendEntry } from "./RecognitionBackendEntry";
import type { useRecognitionStatus } from "./recognition-power";
import { BackendStateMessage, RuntimeSwitch } from "./RuntimeSwitch";

type Runtime = ReturnType<typeof useBackendRuntime>;
const labels = new Map<string, readonly [string, string]>(
  tools.map(({ id, label }) => [id, label]),
);

export function BackendPanelList({
  runtime,
  rows,
  capabilities,
  currentCapability,
  language,
  recognition,
  onOpenRecognition,
  onRetry,
}: {
  runtime: Runtime;
  rows: NonNullable<Runtime["catalogue"]>["engines"];
  capabilities?: readonly string[];
  currentCapability?: string;
  language: Language;
  recognition: ReturnType<typeof useRecognitionStatus>;
  onOpenRecognition?(): void;
  onRetry(): void;
}) {
  const [search, setSearch] = useState("");
  const zh = language === "zh";
  const query = search.trim().toLocaleLowerCase();
  const matches = (...words: string[]) =>
    words.some((word) => word.toLocaleLowerCase().includes(query));
  const owners = runtime.catalogue?.capabilities;
  const current = currentCapability && owners?.[currentCapability];
  const functions = new Map<string, (readonly [string, string])[]>();
  for (const id of capabilities ?? labels.keys()) {
    const owner = owners?.[id];
    const label = labels.get(id);
    if (!owner || !label) continue;
    const tasks = functions.get(owner) ?? [];
    tasks.push(label);
    functions.set(owner, tasks);
  }
  const entries = rows
    .map((engine) => ({ engine, tasks: functions.get(engine.id) ?? [] }))
    .filter(({ engine, tasks }) => matches(engine.name, ...tasks.flat()))
    .sort(
      (a, b) =>
        Number(b.engine.id === current) - Number(a.engine.id === current),
    );
  const harness = rows.find((row) => row.id === "harness");
  const compute = useComputePower();
  const showCompute =
    Boolean(
      compute && (capabilities ? harness : compute.service?.configured),
    ) &&
    (!query ||
      entries.some(({ engine }) => engine.id === "harness") ||
      matches("常驻计算服务", "Persistent compute"));
  const showRecognition =
    onOpenRecognition &&
    matches("DECIMER", "图片识别与编辑", "Image recognition & editor");

  return (
    <>
      <BackendStateMessage
        runtime={runtime}
        language={language}
        failed={rows.some((row) => row.id === runtime.failed)}
        focusAfterRetry={onRetry}
      />
      {!runtime.catalogue && !runtime.readError && (
        <p role="status">{zh ? "正在读取…" : "Loading…"}</p>
      )}
      {rows.length > 2 && (
        <label className="backend-controls-search">
          <span className="sr-only">
            {zh ? "搜索任务或后端" : "Find a task or backend"}
          </span>
          <input
            type="search"
            placeholder={zh ? "搜索任务或后端" : "Find a task or backend"}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      )}
      <div className="backend-controls-list">
        {entries.map(({ engine, tasks }) => (
          <RuntimeSwitch
            key={engine.id}
            item={engine}
            language={language}
            runtime={runtime}
            taskNames={tasks.map((label) => label[zh ? 0 : 1])}
            current={engine.id === current}
          />
        ))}
        {showRecognition && (
          <RecognitionBackendEntry
            language={language}
            powerControl={recognition}
            onOpen={onOpenRecognition}
          />
        )}
        {showCompute && (
          <ComputeSwitch
            language={language}
            activity={computeActivity(harness, runtime.readError)}
          />
        )}
      </div>
      {query && entries.length === 0 && !showRecognition && !showCompute && (
        <p role="status">{zh ? "没有匹配的后端" : "No matching backends"}</p>
      )}
    </>
  );
}
