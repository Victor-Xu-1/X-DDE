import { taskKinds, type TaskKind } from "./presets";
import { Hint } from "./Hint";
import type { Language } from "../types";
export function WorkflowChoices({
  value,
  onChange,
  language,
  abagAvailable,
}: {
  value: TaskKind;
  onChange(value: TaskKind): void;
  language: Language;
  abagAvailable: boolean;
}) {
  const i = language === "zh" ? 0 : 1;
  return (
    <section className="workflow-picker">
      <h2>{i === 0 ? "你想预测什么？" : "What would you like to predict?"}</h2>
      <div
        className="workflow-options"
        role="radiogroup"
        aria-label={i === 0 ? "任务类型" : "Task type"}
      >
        {taskKinds
          .filter(
            (x) => x.id !== "antibody" || abagAvailable || value === "antibody",
          )
          .map((item) => (
            <label
              key={item.id}
              className={value === item.id ? "selected" : ""}
            >
              <input
                type="radio"
                name="task-kind"
                checked={value === item.id}
                aria-label={item.label[i]}
                onChange={() => onChange(item.id)}
              />
              <span>
                <strong>{item.label[i]}</strong>
                <small>{item.note[i]}</small>
              </span>
            </label>
          ))}
      </div>
      <div className="workflow-note">
        <Hint label={i === 0 ? "预测内容说明" : "Prediction scope help"}>
          {i === 0
            ? "当前流程未使用同源序列比对（MSA）或已知结构模板。输出为结构和模型置信度；抗体模块预测已有抗体的复合物，不生成新抗体序列。"
            : "This local workflow runs without MSA or templates. Outputs are structures and model confidence; the antibody workflow folds existing sequences rather than designing new ones."}
        </Hint>
      </div>
    </section>
  );
}
