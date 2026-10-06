import type { Asset } from "../operations/types";
import type { Language } from "../types";
import { DatasetPicker } from "./DatasetPicker";
import { Hint } from "../guided/Hint";

export interface ReadLane {
  id: string;
  file: Asset | null;
  mate: Asset | null;
  paired: boolean;
  encodedMate: "r1" | "r2";
  assignments: { sample: string; barcode: string }[];
}
export const newReadLane = (number = 1): ReadLane => ({
  id: "lane_" + crypto.randomUUID(),
  file: null,
  mate: null,
  paired: false,
  encodedMate: "r1",
  assignments: [{ sample: "sample" + number, barcode: "" }],
});
export function validReadLanes(lanes: ReadLane[], design = false): boolean {
  return (
    lanes.length > 0 &&
    lanes.reduce((total, lane) => total + lane.assignments.length, 0) <= 64 &&
    lanes.every(
      (lane) =>
        !!lane.file &&
        (!lane.paired || !!lane.mate) &&
        (!design ||
          (lane.assignments.length > 0 &&
            lane.assignments.every(
              (assignment) =>
                /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(assignment.sample) &&
                /^[ACGT]{0,32}$/.test(assignment.barcode),
            ) &&
            (lane.assignments.length === 1 ||
              lane.assignments.every((assignment) => !!assignment.barcode)) &&
            lane.assignments.every((left, i) =>
              lane.assignments
                .slice(i + 1)
                .every(
                  (right) =>
                    !left.barcode.startsWith(right.barcode) &&
                    !right.barcode.startsWith(left.barcode),
                ),
            ))),
    )
  );
}
export function DELReadFiles({
  language,
  lanes,
  onChange,
  design = false,
}: {
  language: Language;
  lanes: ReadLane[];
  onChange(lanes: ReadLane[]): void;
  design?: boolean;
}) {
  const zh = language === "zh";
  function edit(id: string, patch: Partial<ReadLane>) {
    onChange(
      lanes.map((lane) => (lane.id === id ? { ...lane, ...patch } : lane)),
    );
  }
  return (
    <section className="del-read-design">
      {lanes.map((lane, index) => (
        <div key={lane.id} className="del-read-lane">
          <div className="dataset-panel-title">
            <strong>
              {zh ? "测序文件组" : "Read group"} {index + 1}
            </strong>
            {lanes.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  onChange(lanes.filter((item) => item.id !== lane.id))
                }
              >
                {zh ? "移除" : "Remove"}
              </button>
            )}
          </div>
          {design ? (
            <>
              <small>
                {lane.file?.name}
                {lane.paired && " + " + lane.mate?.name}
              </small>
              <div className="table-wrap">
                <table className="research-table">
                  <thead>
                    <tr>
                      <th>{zh ? "样本名称（英文或编号）" : "Sample name"}</th>
                      <th>
                        {zh
                          ? "拆分条码（可选）"
                          : "Demultiplexing prefix (optional)"}
                      </th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {lane.assignments.map((assignment, position) => (
                      <tr key={position}>
                        <td>
                          <input
                            aria-label={
                              (zh ? "样本" : "Sample") +
                              " " +
                              (index + 1) +
                              "." +
                              (position + 1)
                            }
                            value={assignment.sample}
                            onChange={(e) =>
                              edit(lane.id, {
                                assignments: lane.assignments.map((item, j) =>
                                  j === position
                                    ? { ...item, sample: e.target.value }
                                    : item,
                                ),
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            aria-label={
                              (zh ? "条码" : "Barcode") +
                              " " +
                              (index + 1) +
                              "." +
                              (position + 1)
                            }
                            value={assignment.barcode}
                            placeholder={
                              zh
                                ? "已拆分文件留空"
                                : "Blank for demultiplexed reads"
                            }
                            onChange={(e) =>
                              edit(lane.id, {
                                assignments: lane.assignments.map((item, j) =>
                                  j === position
                                    ? {
                                        ...item,
                                        barcode: e.target.value.toUpperCase(),
                                      }
                                    : item,
                                ),
                              })
                            }
                          />
                        </td>
                        <td>
                          {lane.assignments.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                edit(lane.id, {
                                  assignments: lane.assignments.filter(
                                    (_, j) => j !== position,
                                  ),
                                })
                              }
                            >
                              ×
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {lane.assignments.length < 16 && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    edit(lane.id, {
                      assignments: [
                        ...lane.assignments,
                        { sample: "", barcode: "" },
                      ],
                    })
                  }
                >
                  {zh
                    ? "+ 此文件内还有一个样本"
                    : "+ Another sample in this file"}
                </button>
              )}
              {lane.paired && (
                <label className="field">
                  {zh
                    ? "DEL 编码位于哪一端？"
                    : "Which mate contains the DEL code?"}
                  <select
                    value={lane.encodedMate}
                    onChange={(e) =>
                      edit(lane.id, {
                        encodedMate: e.target.value as "r1" | "r2",
                      })
                    }
                  >
                    <option value="r1">R1</option>
                    <option value="r2">R2</option>
                  </select>
                  <Hint label={zh ? "双端读段说明" : "Paired reads help"}>
                    {zh
                      ? "核对双端名称和顺序，每对只统计一条含编码的读段；不会把两端重复计数或自动裁掉 UMI。"
                      : "Verify paired identities and order. Count the confirmed code-bearing mate once per pair; preserve UMIs."}
                  </Hint>
                </label>
              )}
            </>
          ) : (
            <>
              <label className="dataset-confirm">
                <input
                  type="checkbox"
                  checked={lane.paired}
                  onChange={(e) => edit(lane.id, { paired: e.target.checked })}
                />
                {zh ? "双端测序（R1 + R2）" : "Paired-end reads (R1 + R2)"}
              </label>
              <div className="dataset-field-grid">
                <DatasetPicker
                  kind="reads"
                  label={lane.paired ? "R1 · FASTQ" : "FASTQ / FASTQ.GZ"}
                  value={lane.file}
                  onChange={(file) => edit(lane.id, { file })}
                  language={language}
                />
                {lane.paired && (
                  <DatasetPicker
                    kind="reads"
                    label="R2 · FASTQ"
                    value={lane.mate}
                    onChange={(mate) => edit(lane.id, { mate })}
                    language={language}
                  />
                )}
              </div>
            </>
          )}
        </div>
      ))}
      {!design && lanes.length < 32 && (
        <button
          type="button"
          className="secondary-button"
          onClick={() => onChange([...lanes, newReadLane(lanes.length + 1)])}
        >
          {zh ? "+ 添加测序文件组" : "+ Add read group"}
        </button>
      )}
    </section>
  );
}
