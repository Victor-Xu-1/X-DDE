import { useEffect, useState } from "react";
import type { Job, Language } from "../types";
import type { ScientificObject } from "../research/types";
import type { Ketcher } from "./scientificEditor";
import { useTaskSubmit } from "../operations/useTaskSubmit";
import { Questionnaire } from "../guided/Questionnaire";
import { useTaskReadiness } from "../guided/useTaskReadiness";
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
    run = useTaskSubmit(onCreated);
  const { ready, error: readinessError } = useTaskReadiness("diffsbdd.edit");
  const [open, setOpen] = useState(false),
    [original, setOriginal] = useState<ScientificObject | null>(null),
    [molblock, setMolblock] = useState(""),
    [reading, setReading] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setOpen(false);
    setOriginal(null);
    setMolblock("");
  }, [origin?.id]);
  async function capture() {
    setReading(true);
    setError("");
    try {
      let value = "";
      await execute(async (editor) => {
        value = await editor.getMolfile();
      });
      if (!value.trim())
        throw new Error(
          zh
            ? "无法读取编辑结构，请检查编辑器后重试。"
            : "Cannot read the edited structure. Check the editor and retry.",
        );
      setMolblock(value);
    } catch (e) {
      setError(String(e));
    } finally {
      setReading(false);
    }
  }
  if (!open)
    return (
      <button
        type="button"
        disabled={busy || !origin}
        onClick={() => {
          setOriginal(origin);
          setMolblock("");
          setError("");
          setOpen(true);
        }}
      >
        {zh ? "生成对齐的三维编辑版本" : "Create an aligned 3D edit"}
      </button>
    );
  return (
    <section
      className="aligned-edit-task"
      aria-label={zh ? "三维编辑任务" : "3D edit task"}
    >
      <button
        type="button"
        className="secondary-button"
        disabled={busy || reading || run.busy}
        onClick={() => setOpen(false)}
      >
        {zh ? "返回编辑器" : "Return to editor"}
      </button>
      <Questionnaire
        language={language}
        busy={busy || reading || run.busy}
        error={run.error || error || readinessError}
        ready={ready}
        unavailable={
          zh
            ? "请先在安装与组件中配置 DiffSBDD 化学环境；当前编辑内容已保留。"
            : "Configure the DiffSBDD chemistry environment in Installation & components. The edit is retained."
        }
        submitLabel={zh ? "递交三维编辑任务" : "Submit 3D edit task"}
        onSubmit={() =>
          original
            ? run.submit({
                operation: "diffsbdd",
                name: (original.label + " · aligned edit").slice(0, 80),
                payload: {
                  mode: "edit",
                  original: original.reference,
                  molblock,
                  notes: original.notes,
                  rating: original.rating,
                },
              })
            : Promise.resolve(undefined)
        }
        steps={[
          {
            title: zh ? "确认原分子" : "Confirm original",
            valid: Boolean(original),
            content: <p>{original?.label}</p>,
          },
          {
            title: zh ? "读取编辑内容" : "Capture edit",
            valid: Boolean(molblock),
            content: (
              <>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void capture()}
                  disabled={reading}
                >
                  {zh ? "读取当前编辑结构" : "Read current edited structure"}
                </button>
                <p className="field-help">
                  {molblock
                    ? zh
                      ? "已读取编辑内容。若继续修改，请重新读取后再递交。"
                      : "Edit captured. Read it again after further changes before submission."
                    : zh
                      ? "先在编辑器完成修改，再读取本次要递交的结构。"
                      : "Finish editing, then read the structure to submit."}
                </p>
              </>
            ),
          },
          {
            title: zh ? "确认方案" : "Confirm settings",
            valid: true,
            content: (
              <p
                className="field-help"
                title={
                  zh
                    ? "原生程序检查化学图、生成构象并对齐共同核心；旧原子选择失效。结果不是预测结合姿势。"
                    : "Native code checks the graph, generates a conformer and aligns its common core. Old atom selections become invalid; this is not a predicted binding pose."
                }
              >
                {zh
                  ? "使用原分子的共同核心进行三维对齐，保留原版本。"
                  : "Align the edited structure using the original common core; retain the original version."}
              </p>
            ),
          },
          {
            title: zh ? "确认递交" : "Review & submit",
            valid: Boolean(original && molblock),
            content: (
              <dl className="questionnaire-review">
                <dt>{zh ? "原分子" : "Original"}</dt>
                <dd>{original?.label}</dd>
                <dt>{zh ? "编辑内容" : "Edit"}</dt>
                <dd>
                  {zh
                    ? "使用第二步读取的结构"
                    : "Use the structure captured in step 2"}
                </dd>
              </dl>
            ),
          },
        ]}
      />
    </section>
  );
}
