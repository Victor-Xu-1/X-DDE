import { ComputeServicePanel } from "./ComputeServicePanel";
import type { Deployment } from "./client";
import type { ComponentActions } from "./ComponentCard";

export function ComponentSettings({
  data,
  zh,
  location,
  setLocation,
  busy,
  execute,
  save,
  onEditors,
}: {
  data: Deployment;
  zh: boolean;
  location: string;
  busy: boolean;
  setLocation(value: string): void;
  save(): Promise<void>;
  onEditors(): void;
  execute: ComponentActions["execute"];
}) {
  const ready = data.compute_service?.ready;
  return (
    <details className="deployment-disclosure deployment-settings">
      <summary>
        <strong>
          {zh ? "安装位置与运行服务" : "Location & compute service"}
        </strong>
        <span className="deployment-location" title={location}>
          {location}
        </span>
        {data.compute_service && (
          <span className={ready ? "status-pill installed" : "status-pill"}>
            {ready
              ? zh
                ? "计算已就绪"
                : "Compute ready"
              : zh
                ? "计算待配置"
                : "Compute setup needed"}
          </span>
        )}
      </summary>
      <div className="deployment-settings-content">
        <div className="setup-grid">
          <section className="setup-card">
            <h2>{zh ? "安装位置" : "Installation location"}</h2>
            <label className="field">
              <span className="sr-only">
                {zh ? "安装位置" : "Installation location"}
              </span>
              <input
                list="install-locations"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="E:\\WSL\\apps\\x-dde"
              />
              <datalist id="install-locations">
                {data.locations.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </label>
            <p className="field-help">
              {zh
                ? "可填写 E:\\WSL\\apps\\x-dde 或 Linux 路径。各环境独立安装，已有安装保留原目录。"
                : "Use E:\\WSL\\apps\\x-dde or a Linux path. Environments remain isolated; existing installations keep their location."}
            </p>
            <div className="component-actions">
              <button
                disabled={busy || !location.trim()}
                onClick={() => void execute(save)}
              >
                {zh ? "保存位置" : "Save location"}
              </button>
              <button onClick={onEditors}>
                {zh ? "打开分子编辑" : "Open molecular editor"}
              </button>
            </div>
          </section>
          <ComputeServicePanel
            data={data}
            zh={zh}
            busy={busy}
            execute={execute}
          />
        </div>
        {(!data.prerequisites.docker || !data.prerequisites.uv) && (
          <aside className="notice">
            <strong>
              {zh ? "系统依赖待配置" : "System prerequisites needed"}
            </strong>
            <p>
              {zh
                ? "uv 由工作台安装器提供；Docker 可使用下方命令安装。GPU 驱动和 NVIDIA Container Toolkit 请按 README 配置。"
                : "The installer provides uv. Install Docker with the command below; configure the GPU driver and NVIDIA Container Toolkit as documented in README."}
            </p>
            <code>sudo $(command -v xdde) setup system</code>
          </aside>
        )}
      </div>
    </details>
  );
}
