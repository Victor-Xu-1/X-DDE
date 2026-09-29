import { useState } from "react";
import type { Health, Job, Language } from "../types";
import { useTaskSubmit } from "./useTaskSubmit";
import type { ResourceTask } from "./types";

export function ResourceForm({
  language,
  health,
  onCreated,
}: {
  language: Language;
  health: Health | null;
  onCreated(j: Job): void;
}) {
  const zh = language === "zh",
    [targets, setTargets] = useState<ResourceTask["targets"]>([]),
    [consent, setConsent] = useState(false),
    run = useTaskSubmit(onCreated);
  return (
    <div className="tool-form">
      <p>
        {zh
          ? "模型和数据库安装在计算服务器。文件存在状态不代表科学结果已经验收。"
          : "Models and databases are installed on the compute server. File presence is not scientific validation."}
      </p>
      <div className="resource-list">
        {(
          [
            [
              "standard",
              "标准模型",
              "Standard model",
              "~2.6 GB",
              health?.engine.models?.standard,
            ],
            [
              "abag",
              "抗体–抗原模型",
              "Antibody–antigen model",
              "~2.6 GB",
              health?.engine.models?.abag,
            ],
            [
              "common",
              "CCD 与公共数据",
              "CCD and common resources",
              "",
              health?.engine.resources?.common,
            ],
            [
              "search",
              "模板与 RNA 数据库整包",
              "Template and RNA database bundle",
              ">100 GiB free space",
              health?.engine.resources?.templates &&
                health?.engine.resources?.rna,
            ],
          ] as const
        ).map(([id, cn, en, size, present]) => (
          <label key={id}>
            <input
              type="checkbox"
              checked={targets.includes(id)}
              onChange={(e) =>
                setTargets(
                  e.target.checked
                    ? [...targets, id]
                    : targets.filter((x) => x !== id),
                )
              }
            />
            <span>
              <strong>{zh ? cn : en}</strong>
              <small>
                {size} ·{" "}
                {present
                  ? zh
                    ? "文件已存在"
                    : "Files present"
                  : zh
                    ? "尚未就绪"
                    : "Not ready"}
              </small>
            </span>
          </label>
        ))}
      </div>
      <label className="network-choice">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        {zh
          ? "允许从官方资源源下载所选文件。"
          : "Allow downloads of the selected official resources."}
      </label>
      <div className="task-actions">
        <button
          className="primary-button"
          disabled={run.busy || !targets.length || !consent}
          onClick={() =>
            void run.submit({
              operation: "resources",
              name: zh ? "安装计算资源" : "Install compute resources",
              targets,
              allow_network: consent,
            })
          }
        >
          {zh ? "下载并安装" : "Download and install"}
        </button>
        <button
          className="secondary-button"
          disabled={run.busy}
          onClick={() =>
            void run.submit({
              operation: "doctor",
              name: zh ? "环境诊断" : "Environment diagnostics",
            })
          }
        >
          {zh ? "运行环境检查" : "Run doctor"}
        </button>
      </div>
      {run.error && (
        <p role="alert" className="error-box">
          {run.error}
        </p>
      )}
    </div>
  );
}
