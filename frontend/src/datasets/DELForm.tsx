import { GuidedSteps } from "../guided/Questionnaire";
import type { ToolId } from "../operations/catalog";
import type { Job, Language } from "../types";
import { ExecutionView } from "./ExecutionView";
import type { DatasetExecution } from "./useDatasetRun";
import { useDELForm } from "./useDELForm";
import { DELMaterialQuestion } from "./DELMaterialQuestion";
import { DELScopeQuestion } from "./DELScopeQuestion";
import { DELMethodQuestion } from "./DELMethodQuestion";
import { DELReviewQuestion } from "./DELReviewQuestion";

export function DELForm({
  tool,
  language,
  onCreated,
  onPrepare,
}: {
  tool: ToolId;
  language: Language;
  onCreated(job: Job): void;
  onPrepare?(tool: ToolId): void;
}) {
  const model = useDELForm({ tool, language, onCreated });
  const { zh, run, error, readiness, firstValid, mode, planValid, submit } =
    model;
  return (
    <div className="dataset-workspace">
      <GuidedSteps<DatasetExecution>
        language={language}
        busy={run.busy}
        error={run.error || model.templateError || error}
        ready={readiness.ready}
        unavailable={
          zh
            ? "请在安装与组件中准备 DELi 环境。"
            : "Prepare the DELi environment in Components."
        }
        submitLabel={zh ? "提交研究任务" : "Submit study"}
        onSubmit={submit}
        renderResult={(value) => (
          <ExecutionView
            execution={value}
            language={language}
            onCreated={onCreated}
          />
        )}
        steps={[
          {
            title: zh ? "选择研究材料" : "Choose study materials",
            valid: firstValid,
            content: (
              <DELMaterialQuestion model={model} onPrepare={onPrepare} />
            ),
          },
          {
            title:
              mode === "analyze"
                ? zh
                  ? "填写实验分组"
                  : "Assign study groups"
                : mode === "candidates"
                  ? zh
                    ? "选择候选成员"
                    : "Choose members"
                  : zh
                    ? "确认研究范围"
                    : "Confirm study scope",
            valid: planValid,
            content: <DELScopeQuestion model={model} />,
          },
          {
            title: zh ? "选择分析方案" : "Choose analysis",
            valid: planValid,
            content: <DELMethodQuestion model={model} />,
          },
          {
            title: zh ? "确认并提交" : "Review and submit",
            valid: planValid && firstValid,
            content: <DELReviewQuestion model={model} />,
          },
        ]}
      />
    </div>
  );
}
