import type { Language } from "../types";
import type { ExampleAction, ExampleFailure } from "./useExampleTemplate";

const loading = {
  metadata: ["正在读取案例…", "Loading example…"],
  template: ["正在准备模板…", "Preparing template…"],
  result: ["正在打开示例…", "Opening example…"],
};
const failures = {
  metadata: ["案例说明暂不可用", "Example guide unavailable"],
  template: ["模板材料暂不可用", "Example inputs unavailable"],
  result: ["示例结果暂不可用", "Example results unavailable"],
};

export function ExampleFeedback({
  language,
  pending,
  failure,
  onRetry,
}: {
  language: Language;
  pending: ExampleAction | null;
  failure: ExampleFailure | null;
  onRetry(): void;
}) {
  const index = language === "zh" ? 0 : 1;
  if (pending)
    return (
      <p className="example-loading" role="status">
        {loading[pending][index]}
      </p>
    );
  if (!failure) return null;
  const connection =
    /Failed to fetch|NetworkError|ConnectionRefused|timed out|timeout/i.test(
      failure.reason,
    );
  return (
    <div className="example-failure" role="alert">
      <div>
        <strong>{failures[failure.action][index]}</strong>
        <p>
          {connection
            ? index === 0
              ? "案例未能读取，请检查连接后重试。"
              : "The example could not be retrieved. Check the connection and retry."
            : index === 0
              ? "可重试，或继续填写自己的任务材料。"
              : "Retry, or continue with your own task inputs."}
        </p>
      </div>
      <button type="button" className="secondary-button" onClick={onRetry}>
        {index === 0 ? "重试" : "Retry"}
      </button>
    </div>
  );
}
