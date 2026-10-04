import type { Deployment } from "./client";
import type { ComponentActions } from "./ComponentCard";
import { missingComponents, pendingOperation } from "./component-groups";

/** Group deployment uses the same reviewed package catalogue as individual installs. */
export function ComponentBundle({
  data,
  recommended,
  description,
  zh,
  busy,
  execute,
  install,
}: {
  data: Deployment;
  recommended: string[];
  description: string;
  zh: boolean;
  busy: boolean;
} & ComponentActions) {
  if (!recommended.length) return null;
  const missing = missingComponents(data, recommended);
  const pending = recommended.some((id) => pendingOperation(data, id));
  const complete = recommended.every((id) => data.installed[id]);
  return (
    <button
      className="component-bundle"
      disabled={busy || !missing.length}
      title={
        (zh
          ? "只补齐缺失组件，自动处理依赖。"
          : "Install missing components with server-managed dependencies. ") +
        description
      }
      onClick={() => void execute(() => install(recommended))}
    >
      {complete
        ? zh
          ? "组合已安装"
          : "Bundle installed"
        : !missing.length && pending
          ? zh
            ? "部署中"
            : "Deploying"
          : zh
            ? "部署推荐组合"
            : "Install recommended bundle"}
    </button>
  );
}
