import { useEffect, useState } from "react";
import { request } from "../api";
import type { Asset } from "../operations/types";
import type { ScientificTask } from "../integrations/types";
import type { Language } from "../types";

export function SimulationInputs({
  inputs,
  language,
}: {
  inputs: ScientificTask["inputs"];
  language: Language;
}) {
  const zh = language === "zh";
  const key = JSON.stringify(inputs);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    files: Asset[];
    error: boolean;
  }>({ key: "", files: [], error: false });
  useEffect(() => {
    const controller = new AbortController();
    const selected = JSON.parse(key) as ScientificTask["inputs"];
    setState({ key: "", files: [], error: false });
    void Promise.all(
      selected.map(async ({ source }) => {
        const file = await request<Asset>(
          `/assets/${encodeURIComponent(source.asset_id)}/metadata`,
          {
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(30000),
            ]),
          },
        );
        if (file.id !== source.asset_id || file.sha256 !== source.sha256)
          throw new Error("Selected file identity differs from its metadata.");
        return file;
      }),
    ).then(
      (files) => {
        if (!controller.signal.aborted) setState({ key, files, error: false });
      },
      () => {
        if (!controller.signal.aborted)
          setState({ key, files: [], error: true });
      },
    );
    return () => controller.abort();
  }, [key, attempt]);
  const loaded = state.key === key;
  return (
    <section
      className="simulation-review-inputs"
      aria-label={zh ? "所选研究材料" : "Selected research inputs"}
      aria-busy={!loaded}
    >
      <h3>{zh ? "研究材料" : "Research inputs"}</h3>
      {loaded && state.error ? (
        <div className="simulation-input-error" role="alert">
          <p>
            {zh
              ? "文件详情暂不可用，请重试或返回检查所选材料。"
              : "File details are unavailable. Retry or go back to check your inputs."}
          </p>
          <button
            type="button"
            className="text-button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            {zh ? "重试" : "Retry"}
          </button>
        </div>
      ) : (
        <ul>
          {inputs.map((input, index) => (
            <li key={`${input.role}:${input.source.asset_id}`}>
              <span>
                {input.role === "structure"
                  ? zh
                    ? "蛋白结构"
                    : "Protein structure"
                  : input.role === "library"
                    ? zh
                      ? "分子库"
                      : "Molecular library"
                    : zh
                      ? "结合小分子"
                      : "Bound ligand"}
              </span>
              <strong>
                {loaded
                  ? state.files[index].name
                  : zh
                    ? "正在读取文件…"
                    : "Loading file…"}
              </strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
