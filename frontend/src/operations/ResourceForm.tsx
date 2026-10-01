import { useState } from "react";
import type { Health, Job, Language } from "../types";
import { useTaskSubmit } from "./useTaskSubmit";
import { Questionnaire } from "../guided/Questionnaire";
import { useTaskReadiness } from "../guided/useTaskReadiness";
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
  const [mode, setMode] = useState<"resources" | "doctor">("resources");
  const { ready, error } = useTaskReadiness("resources");
  const goal = (
    <label className="field">
      {zh ? "这次需要做什么？" : "What should be done?"}
      <select
        value={mode}
        onChange={(e) => setMode(e.target.value as typeof mode)}
      >
        <option value="resources">
          {zh ? "安装模型或数据库" : "Install models or databases"}
        </option>
        <option value="doctor">
          {zh
            ? "检查已有 OpenDDE 环境"
            : "Inspect the existing OpenDDE environment"}
        </option>
      </select>
    </label>
  );
  const selection =
    mode === "resources" ? (
      <>
        {" "}
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
      </>
    ) : (
      <p className="field-help">
        {zh
          ? "将读取并诊断现有 OpenDDE 集成环境。此任务不下载模型。"
          : "Inspect the existing OpenDDE integration environment without model downloads."}
      </p>
    );
  const options =
    mode === "resources" ? (
      <>
        {" "}
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
      </>
    ) : (
      <p className="field-help">
        {zh
          ? "采用已有环境的诊断设置。"
          : "Use the installed environment's diagnostic settings."}
      </p>
    );
  const review = (
    <dl className="questionnaire-review">
      <dt>{zh ? "任务" : "Task"}</dt>
      <dd>
        {mode === "resources"
          ? zh
            ? "安装所选资源"
            : "Install selected resources"
          : zh
            ? "检查 OpenDDE 环境"
            : "Inspect OpenDDE environment"}
      </dd>
      <dt>{zh ? "下载范围" : "Download scope"}</dt>
      <dd>
        {mode === "resources"
          ? `${targets.length}`
          : zh
            ? "无需下载"
            : "No downloads"}
      </dd>
      <dt>{zh ? "保存位置" : "Storage location"}</dt>
      <dd>
        {zh
          ? "由服务器上的集成环境配置管理"
          : "Managed by the server's integration environment configuration"}
      </dd>
    </dl>
  );
  return (
    <Questionnaire
      language={language}
      ready={ready}
      busy={run.busy}
      error={run.error || error}
      unavailable={
        zh
          ? "请先在安装与组件中配置 OpenDDE 集成环境，再运行它的资源或诊断命令。"
          : "Configure the OpenDDE integration environment in Installation & components before running its resource or diagnostic commands."
      }
      submitLabel={
        mode === "resources"
          ? zh
            ? "下载并安装"
            : "Download and install"
          : zh
            ? "运行环境检查"
            : "Run doctor"
      }
      resultTitle={zh ? "查看进度" : "View progress"}
      onSubmit={() =>
        run.submit(
          mode === "resources"
            ? {
                operation: "resources",
                name: zh ? "安装计算资源" : "Install compute resources",
                targets,
                allow_network: consent,
              }
            : {
                operation: "doctor",
                name: zh ? "环境诊断" : "Environment diagnostics",
              },
        )
      }
      steps={[
        { title: zh ? "选择任务" : "Choose task", content: goal, valid: true },
        {
          title: zh ? "选择资源" : "Choose resources",
          content: selection,
          valid: mode === "doctor" || targets.length > 0,
        },
        {
          title: zh ? "确认设置" : "Confirm settings",
          content: options,
          valid: mode === "doctor" || consent,
        },
        {
          title: zh ? "确认启动" : "Review & start",
          content: review,
          valid: mode === "doctor" || (targets.length > 0 && consent),
        },
      ]}
    />
  );
}
