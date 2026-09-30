import { useEffect, useState } from "react";
import { request } from "../api";
import type { Job, Language } from "../types";
import type { ScientificObject } from "../research/types";
import type { Ketcher } from "./scientificEditor";
import { useTaskSubmit } from "../operations/useTaskSubmit";
export function AlignedEditAction({
  origin,
  language,
  busy,
  execute,
  onCreated,
}: {
  origin: ScientificObject | null;
  language: Language;
  busy: boolean;
  execute(fn: (editor: Ketcher) => Promise<void>): Promise<void>;
  onCreated(job: Job): void;
}) {
  const zh = language === "zh",
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const run = useTaskSubmit(onCreated);
  useEffect(() => {
    const c = new AbortController();
    void request<{ availability: { configuration_present: boolean } }>(
      "/capabilities/diffsbdd.edit",
      { signal: c.signal },
    )
      .then((value) => {
        if (!c.signal.aborted)
          setReady(value.availability.configuration_present);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(String(e));
      });
    return () => c.abort();
  }, []);
  return (
    <span>
      <button
        type="button"
        disabled={busy || run.busy || !origin || !ready}
        title={
          zh
            ? "需要已保存的三维 SDF 原分子和 DiffSBDD 化学环境。由原生程序检查化学图、生成编辑构象并对齐共同核心；结果不是预测结合姿势，旧原子选择失效。"
            : "Requires a saved 3D SDF original and the DiffSBDD chemistry environment. Native code checks the graph and aligns an edited conformer on its common core. This is not a predicted binding pose; old selections become invalid."
        }
        onClick={() => {
          const original = origin;
          if (!original) return;
          void execute(async (editor) => {
            const molblock = await editor.getMolfile();
            await run.submit({
              operation: "diffsbdd",
              name: (original.label + " · aligned edit").slice(0, 80),
              payload: {
                mode: "edit",
                original: original.reference,
                molblock,
                notes: original.notes,
                rating: original.rating,
              },
            });
          });
        }}
      >
        {zh ? "生成对齐的三维编辑版本" : "Create an aligned 3D edit"}
      </button>
      {(error || run.error) && <span role="alert">{error || run.error}</span>}
    </span>
  );
}
