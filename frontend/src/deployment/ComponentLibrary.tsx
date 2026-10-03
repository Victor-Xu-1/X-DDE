import { useState } from "react";
import { api } from "../api";
import type { Deployment } from "./client";
import { ComponentCard, type ComponentActions } from "./ComponentCard";
import {
  componentGroups,
  missingComponents,
  pendingOperation,
  visibleDeploymentActivity,
} from "./component-groups";
import { componentName } from "./labels";

export function ComponentLibrary({
  data,
  zh,
  busy,
  execute,
  install,
}: {
  data: Deployment;
  zh: boolean;
  busy: boolean;
} & ComponentActions) {
  const [remove, setRemove] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const groups = componentGroups(data.packages);
  const removedPackage = data.packages.find((p) => p.id === remove);
  const removeName = removedPackage
    ? componentName(removedPackage, zh)
    : remove;
  return (
    <section className="component-library">
      <div className="component-overview">
        <h2>{zh ? "组件" : "Components"}</h2>
        <span
          title={
            zh
              ? "安装状态不等同于模型或计算服务就绪。"
              : "Installed files do not imply compute readiness."
          }
        >
          {zh ? "已安装" : "Installed"}{" "}
          {data.packages.filter((p) => data.installed[p.id]).length}/
          {data.packages.length}
        </span>
      </div>
      <nav
        className="component-filters"
        aria-label={zh ? "组件分组" : "Component groups"}
      >
        <button
          aria-pressed={filter === "all"}
          onClick={() => setFilter("all")}
        >
          {zh ? "全部" : "All"}
        </button>
        {groups.map((group) => (
          <button
            key={group.id}
            aria-pressed={filter === group.id}
            onClick={() => setFilter(group.id)}
          >
            {group.title[zh ? 0 : 1]}
          </button>
        ))}
      </nav>
      {groups
        .filter((group) => filter === "all" || filter === group.id)
        .map((group) => {
          const recommended = group.recommended.filter((id) =>
            group.packages.some((p) => p.id === id),
          );
          const missing = missingComponents(data, recommended);
          const pending = recommended.some((id) => pendingOperation(data, id));
          const complete =
            recommended.length > 0 &&
            recommended.every((id) => data.installed[id]);
          const mainPackages = group.packages.filter((p) =>
            recommended.includes(p.id),
          );
          const additional = group.packages.filter(
            (p) => !recommended.includes(p.id),
          );
          return (
            <section
              key={group.id}
              className="component-group"
              aria-labelledby={"component-group-" + group.id}
            >
              <header className="component-group-heading">
                <h3 id={"component-group-" + group.id}>
                  {group.title[zh ? 0 : 1]}{" "}
                  <small>
                    {group.packages.filter((p) => data.installed[p.id]).length}/
                    {group.packages.length}
                  </small>
                </h3>
                {recommended.length > 0 && (
                  <button
                    className="component-bundle"
                    disabled={busy || !missing.length}
                    title={
                      (zh
                        ? "只补齐缺失组件，自动处理依赖。"
                        : "Install missing components with server-managed dependencies. ") +
                      group.recommendation[zh ? 0 : 1]
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
                )}
              </header>
              <div className="component-grid">
                {(mainPackages.length ? mainPackages : group.packages).map(
                  (p) => (
                    <ComponentCard
                      key={p.id}
                      p={p}
                      data={data}
                      zh={zh}
                      busy={busy}
                      execute={execute}
                      install={install}
                      onRemove={setRemove}
                    />
                  ),
                )}
              </div>
              {mainPackages.length > 0 && additional.length > 0 && (
                <details
                  className="component-additions"
                  open={additional.some(
                    (p) =>
                      pendingOperation(data, p.id) ||
                      visibleDeploymentActivity(data).some(
                        (o) => o.package === p.id && o.state === "failed",
                      ),
                  )}
                >
                  <summary>
                    {zh
                      ? "可选模型与配套组件"
                      : "Optional models & supporting components"}{" "}
                    · {additional.length}
                  </summary>
                  <div className="component-grid">
                    {additional.map((p) => (
                      <ComponentCard
                        key={p.id}
                        p={p}
                        data={data}
                        zh={zh}
                        busy={busy}
                        execute={execute}
                        install={install}
                        onRemove={setRemove}
                      />
                    ))}
                  </div>
                </details>
              )}
            </section>
          );
        })}
      {remove && (
        <section
          className="notice component-removal"
          role="alertdialog"
          aria-label={zh ? "确认卸载" : "Confirm uninstall"}
        >
          <h3>{zh ? `卸载 ${removeName}？` : `Uninstall ${removeName}?`}</h3>
          <p>
            {zh
              ? "组件将停用并移除其独立安装文件。研究结果、模型权重、缓存和共享 Docker 镜像保留；依赖此组件的其他组件须先卸载。"
              : "Deactivate and remove its isolated installation files. Research results, models, cache and shared Docker images remain. Remove dependent components first."}
          </p>
          <button
            disabled={busy}
            onClick={() =>
              void execute(async () => {
                await api.post(`/deployment/packages/${remove}/uninstall`, {});
                setRemove(null);
              })
            }
          >
            {zh ? "确认卸载" : "Confirm uninstall"}
          </button>{" "}
          <button onClick={() => setRemove(null)}>
            {zh ? "取消" : "Cancel"}
          </button>
        </section>
      )}
    </section>
  );
}
