import { api } from "../api";
import type { Deployment } from "./client";
import { pendingOperation, type ComponentPackage } from "./component-groups";
import { componentName, componentSize, states } from "./labels";

export interface ComponentActions {
  execute(action: () => Promise<unknown>): Promise<void>;
  install(keys: string[], repair?: boolean): Promise<void>;
}

const kinds = {
  runtime: ["环境", "Runtime"],
  model: ["模型", "Model"],
  editor: ["编辑器", "Editor"],
  data: ["数据", "Data"],
};
export function ComponentCard({
  p,
  data,
  zh,
  busy,
  execute,
  install,
  onRemove,
}: {
  p: ComponentPackage;
  data: Deployment;
  zh: boolean;
  busy: boolean;
  onRemove(id: string): void;
} & ComponentActions) {
  const installed = data.installed[p.id];
  const pending = pendingOperation(data, p.id);
  const title = componentName(p, zh);
  const kind = p.id === "opendde-search" ? "data" : p.kind;
  const description = p.description.split(" / ")[zh ? 0 : 1] ?? p.description;
  return (
    <article className="component-card" aria-label={title}>
      <div className="component-top">
        <span className="component-kind">{kinds[kind][zh ? 0 : 1]}</span>
        <small title={p.version}>
          {kind === "model" ? (zh ? "固定权重" : "Pinned weights") : p.version}
        </small>
      </div>
      <h3 title={p.name}>{title}</h3>
      <p title={description}>{description}</p>
      <small className="component-size" title={p.size}>
        {componentSize(p, zh)}
      </small>
      <div className="component-actions">
        <button
          className={
            installed && !pending
              ? "component-primary is-installed"
              : "component-primary"
          }
          disabled={!!installed || !!pending || busy}
          title={
            installed
              ? zh
                ? "组件文件已安装；计算可用性请查看运行服务。"
                : "Component files are installed. Check compute service readiness separately."
              : undefined
          }
          onClick={
            installed || pending
              ? undefined
              : () => void execute(() => install([p.id]))
          }
        >
          {pending
            ? zh
              ? states[pending.state]
              : pending.state
            : installed
              ? zh
                ? "已安装"
                : "Installed"
              : zh
                ? "安装"
                : "Install"}
        </button>
        <details className="component-maintenance">
          <summary>{zh ? "维护" : "Manage"}</summary>
          <div className="component-maintenance-menu">
            <small>
              {zh ? "版本" : "Version"}: {installed?.version ?? p.version}
            </small>
            <small>{p.license}</small>
            {installed && (
              <div className="component-maintenance-actions">
                <button
                  disabled={busy || !!pending}
                  onClick={() => void execute(() => install([p.id], true))}
                >
                  {zh ? "修复安装" : "Repair installation"}
                </button>
                <button
                  disabled={
                    busy || !!pending || installed.version === p.version
                  }
                  title={
                    zh
                      ? "更新工作台可获取审核后的组件新版本。"
                      : "Update X-DDE to obtain reviewed component versions."
                  }
                  onClick={() =>
                    void execute(() =>
                      api.post(`/deployment/packages/${p.id}/upgrade`, {}),
                    )
                  }
                >
                  {zh ? "升级" : "Upgrade"}
                </button>
                <button
                  disabled={busy || !!pending}
                  onClick={() => onRemove(p.id)}
                >
                  {zh ? "卸载" : "Uninstall"}
                </button>
              </div>
            )}
          </div>
        </details>
      </div>
    </article>
  );
}
