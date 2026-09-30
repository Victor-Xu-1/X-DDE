import { useState } from "react";
import { api } from "../api";
import type { Deployment } from "./client";
import { names } from "./labels";
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
  execute(action: () => Promise<unknown>): Promise<void>;
  install(keys: string[]): Promise<void>;
}) {
  const [remove, setRemove] = useState<string | null>(null);
  return (
    <>
      {" "}
      <div className="section-heading">
        <h2>{zh ? "组件库" : "Components"}</h2>
        <span>
          {zh
            ? "仅安装经过版本与校验和固定的官方发行版"
            : "Reviewed, pinned official releases"}
        </span>
      </div>
      <div className="component-grid">
        {data.packages.map((p) => {
          const installed = data.installed[p.id];
          const pending = data.operations.some(
            (o) =>
              o.package === p.id &&
              ["queued", "running", "pausing", "paused"].includes(o.state),
          );
          return (
            <article className="component-card" key={p.id}>
              <div className="component-top">
                <span
                  className={
                    installed ? "status-pill installed" : "status-pill"
                  }
                >
                  {installed
                    ? zh
                      ? "已安装"
                      : "Installed"
                    : zh
                      ? "未安装"
                      : "Not installed"}
                </span>
                <small>{p.version}</small>
              </div>
              <h3>{zh ? names[p.id] : p.name}</h3>
              <p>{p.description.split(" / ")[zh ? 0 : 1] ?? p.description}</p>
              <small>
                {p.size} · {p.license}
              </small>
              <div className="component-actions">
                <button
                  disabled={busy || pending}
                  onClick={() => void execute(() => install([p.id]))}
                >
                  {installed
                    ? zh
                      ? "重新安装"
                      : "Reinstall"
                    : zh
                      ? "安装"
                      : "Install"}
                </button>
                {installed && (
                  <>
                    <button
                      disabled={
                        busy || pending || installed.version === p.version
                      }
                      title={
                        zh
                          ? "升级到工作台目录中已审核的新版本；更新工作台可获取新的组件目录。"
                          : "Upgrade to a newer reviewed catalogue release by updating Workbench."
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
                      disabled={busy || pending}
                      onClick={() => setRemove(p.id)}
                    >
                      {zh ? "卸载" : "Uninstall"}
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {remove && (
        <section
          className="notice"
          role="alertdialog"
          aria-label={zh ? "确认卸载" : "Confirm uninstall"}
        >
          <h3>{zh ? `卸载 ${names[remove]}？` : `Uninstall ${remove}?`}</h3>
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
    </>
  );
}
