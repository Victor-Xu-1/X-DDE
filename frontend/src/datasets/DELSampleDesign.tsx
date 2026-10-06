import { useState } from "react";
import { Hint } from "../guided/Hint";
import type { Language } from "../types";
import type { DELComparison, DELSample } from "./types";
const roles: [DELSample["role"], string, string][] = [
  ["target", "靶点样本", "Target"],
  ["ntc", "阴性对照", "Negative reference"],
  ["input", "初始库", "Input library"],
  ["matrix", "基质对照", "Matrix reference"],
  ["competition", "竞争对照", "Competition"],
  ["counter_target", "其他靶点", "Counter-target"],
  ["reference", "类型未注明的对照", "Unspecified reference"],
];
export function DELSampleDesign({
  language,
  columns,
  samples,
  onChange,
  comparisons,
  onComparisons,
}: {
  language: Language;
  columns: string[];
  samples: DELSample[];
  onChange(value: DELSample[]): void;
  comparisons: DELComparison[];
  onComparisons(value: DELComparison[]): void;
}) {
  const zh = language === "zh",
    [candidate, setCandidate] = useState("");
  function update(index: number, patch: Partial<DELSample>) {
    onChange(
      samples.map((sample, i) =>
        i === index ? { ...sample, ...patch } : sample,
      ),
    );
  }
  const groups = [...new Set(samples.map((sample) => sample.group))],
    targets = groups.filter((group) =>
      samples.some(
        (sample) => sample.group === group && sample.role === "target",
      ),
    ),
    references = groups.filter((group) =>
      samples.every(
        (sample) => sample.group !== group || sample.role !== "target",
      ),
    );
  function add() {
    if (!candidate) return;
    onChange([
      ...samples,
      {
        column: candidate,
        group: "group" + (samples.length + 1),
        role: samples.length ? "reference" : "target",
        replicate: 1,
        round: 1,
        batch: "1",
      },
    ]);
    setCandidate("");
  }
  return (
    <div className="del-sample-design">
      <div className="dataset-field-heading">
        <strong>
          {zh
            ? "把计数列分配给实验样本"
            : "Assign count columns to study samples"}
        </strong>
        <Hint label={zh ? "样本分组说明" : "Sample grouping help"}>
          {zh
            ? "同一组中的重复使用相同组名、不同重复编号。靶点、初始库、阴性、基质和竞争对照分别建组；不同批次不要直接混在同一比较中。"
            : "Use one group name with distinct replicate numbers for independent repeats. Keep targets, input, negative, matrix and competition references in separate groups; compare matched batches."}
        </Hint>
      </div>
      <div className="dataset-add-row">
        <select
          aria-label={zh ? "添加计数列" : "Add count column"}
          value={candidate}
          onChange={(e) => setCandidate(e.target.value)}
        >
          <option value="">
            {zh ? "选择一个计数列" : "Choose a count column"}
          </option>
          {columns
            .filter(
              (column) => !samples.some((sample) => sample.column === column),
            )
            .map((column) => (
              <option key={column}>{column}</option>
            ))}
        </select>
        <button
          type="button"
          disabled={!candidate || samples.length >= 64}
          onClick={add}
        >
          {zh ? "添加样本" : "Add sample"}
        </button>
      </div>
      <div className="dataset-table-scroll">
        <table className="del-design-table">
          <thead>
            <tr>
              <th>{zh ? "计数列" : "Count column"}</th>
              <th>{zh ? "样本类型" : "Role"}</th>
              <th>{zh ? "实验组名" : "Group"}</th>
              <th>{zh ? "重复" : "Replicate"}</th>
              <th>{zh ? "轮次" : "Round"}</th>
              <th>{zh ? "批次" : "Batch"}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {samples.map((sample, index) => (
              <tr key={sample.column}>
                <td>{sample.column}</td>
                <td>
                  <select
                    aria-label={`${sample.column} ${zh ? "类型" : "role"}`}
                    value={sample.role}
                    onChange={(e) =>
                      update(index, {
                        role: e.target.value as DELSample["role"],
                      })
                    }
                  >
                    {roles.map(([value, ch, en]) => (
                      <option key={value} value={value}>
                        {zh ? ch : en}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    value={sample.group}
                    maxLength={64}
                    aria-label={`${sample.column} ${zh ? "组名" : "group"}`}
                    onChange={(e) =>
                      update(index, {
                        group: e.target.value.replace(/[^A-Za-z0-9_-]/g, "_"),
                      })
                    }
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={sample.replicate}
                    aria-label={`${sample.column} ${zh ? "重复" : "replicate"}`}
                    onChange={(e) =>
                      update(index, { replicate: Number(e.target.value) })
                    }
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={sample.round}
                    aria-label={`${sample.column} ${zh ? "轮次" : "round"}`}
                    onChange={(e) =>
                      update(index, { round: Number(e.target.value) })
                    }
                  />
                </td>
                <td>
                  <input
                    value={sample.batch}
                    maxLength={40}
                    aria-label={`${sample.column} ${zh ? "批次" : "batch"}`}
                    onChange={(e) => update(index, { batch: e.target.value })}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    aria-label={`${zh ? "删除" : "Remove"} ${sample.column}`}
                    onClick={() => {
                      onChange(samples.filter((_, i) => i !== index));
                      onComparisons([]);
                    }}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="dataset-field-heading">
        <strong>
          {zh ? "要比较哪些组？" : "Which groups should be compared?"}
        </strong>
        <button
          type="button"
          disabled={
            !targets.length || !references.length || comparisons.length >= 16
          }
          onClick={() =>
            onComparisons([
              ...comparisons,
              {
                id: `comparison${comparisons.length + 1}`,
                selection: targets[0],
                reference: references[0],
              },
            ])
          }
        >
          {zh ? "添加比较" : "Add comparison"}
        </button>
      </div>
      {comparisons.map((comparison, index) => (
        <div className="del-comparison-row" key={comparison.id}>
          <select
            aria-label={zh ? "选择靶点组" : "Target group"}
            value={comparison.selection}
            onChange={(e) =>
              onComparisons(
                comparisons.map((row, i) =>
                  i === index ? { ...row, selection: e.target.value } : row,
                ),
              )
            }
          >
            {targets.map((group) => (
              <option key={group}>{group}</option>
            ))}
          </select>
          <span>vs</span>
          <select
            aria-label={zh ? "选择对照组" : "Reference group"}
            value={comparison.reference}
            onChange={(e) =>
              onComparisons(
                comparisons.map((row, i) =>
                  i === index ? { ...row, reference: e.target.value } : row,
                ),
              )
            }
          >
            {references.map((group) => (
              <option key={group}>{group}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() =>
              onComparisons(comparisons.filter((_, i) => i !== index))
            }
          >
            ×
          </button>
        </div>
      ))}
      {!comparisons.length && (
        <p className="field-help">
          {zh
            ? "没有确认对照时，将只展示计数及描述性质量结果。"
            : "Without a confirmed reference, only descriptive count-quality results will be shown."}
        </p>
      )}
    </div>
  );
}
