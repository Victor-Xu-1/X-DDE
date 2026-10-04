import { useState } from "react";
import { api } from "../api";
import type { Deployment } from "./client";
import { ComponentCard, type ComponentActions } from "./ComponentCard";
import {
  componentGroups,
  pendingOperation,
  visibleDeploymentActivity,
} from "./component-groups";
import { ComponentBundle } from "./ComponentBundle";
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
  const visibleGroups = groups.filter(
    (group) => filter === "all" || filter === group.id,
  );
  const selectedGroup = visibleGroups.length === 1 ? visibleGroups[0] : null;
  const entries = visibleGroups.flatMap((group) => {
    const main = group.packages.filter((p) => group.recommended.includes(p.id));
    return group.packages.map((p) => ({
      p,
      groupLabel: group.title[zh ? 0 : 1].split(" · ")[0],
      optional: main.length > 0 && !group.recommended.includes(p.id),
    }));
  });
  const mainEntries = entries.filter((entry) => !entry.optional);
  const optionalEntries = entries.filter((entry) => entry.optional);
  const activity = visibleDeploymentActivity(data);
  function cards(items: typeof entries) {
    return items.map(({ p, groupLabel }) => (
      <ComponentCard
        key={p.id}
        p={p}
        groupLabel={groupLabel}
        data={data}
        zh={zh}
        busy={busy}
        execute={execute}
        install={install}
        onRemove={setRemove}
      />
    ));
  }
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
      {selectedGroup && (
        <header className="component-group-heading">
          <h3>{selectedGroup.title[zh ? 0 : 1]}</h3>
          <ComponentBundle
            data={data}
            zh={zh}
            busy={busy}
            execute={execute}
            install={install}
            recommended={selectedGroup.recommended.filter((id) =>
              selectedGroup.packages.some((p) => p.id === id),
            )}
            description={selectedGroup.recommendation[zh ? 0 : 1]}
          />
        </header>
      )}
      <div className="component-grid">{cards(mainEntries)}</div>
      {optionalEntries.length > 0 && (
        <details
          className="component-additions"
          open={optionalEntries.some(
            ({ p }) =>
              pendingOperation(data, p.id) ||
              activity.some((o) => o.package === p.id && o.state === "failed"),
          )}
        >
          <summary>
            {zh
              ? "可选模型与配套组件"
              : "Optional models & supporting components"}{" "}
            · {optionalEntries.length}
          </summary>
          <div className="component-grid">{cards(optionalEntries)}</div>
        </details>
      )}
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
