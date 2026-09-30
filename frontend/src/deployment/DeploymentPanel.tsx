import { ComponentLibrary } from "./ComponentLibrary";
import { DeploymentActivity } from "./DeploymentActivity";
import { useEffect, useState } from "react";
import { api } from "../api";
import type { Language } from "../types";
import { linuxLocation, type Deployment } from "./client";
import "./deployment.css";

export function DeploymentPanel({
  data,
  error,
  refresh,
  language,
  onEditors,
}: {
  data: Deployment | null;
  error: string;
  refresh(): void;
  language: Language;
  onEditors(): void;
}) {
  const zh = language === "zh";
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (data && !location)
      setLocation(
        data.config.root?.replace(/\/(?:x-dde|opendde)-managed$/, "") ??
          data.default_location,
      );
  }, [data]);
  async function execute(action: () => Promise<unknown>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
      refresh();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    await api.post("/deployment/config", {
      location: linuxLocation(location),
      automatic: true,
    });
  }
  async function install(keys: string[]) {
    await save();
    for (const key of keys)
      await api.post(`/deployment/packages/${key}/install`, {});
  }
  return (
    <section className="deployment-workspace">
      <header className="research-heading">
        <span className="eyebrow">X-DDE ENVIRONMENTS</span>
        <h1>{zh ? "X-DDE 计算环境管理" : "X-DDE environments"}</h1>
        <p>
          {zh
            ? "X-DDE 服务端统一管理各计算引擎。选择位置和研究目标，按需安装对应环境；下载在后台进行。"
            : "The X-DDE server manages each scientific engine. Choose a location and research goal; install the required environment in the background."}
        </p>
      </header>
      {(message || error) && (
        <p className="error" role="alert">
          {message || error}
          {error && (
            <button className="secondary-button" onClick={refresh}>
              {zh ? "重试" : "Retry"}
            </button>
          )}
        </p>
      )}
      {!data ? (
        <p role="status">
          {error
            ? zh
              ? "安装状态暂不可用。"
              : "Installation state is unavailable."
            : zh
              ? "正在读取安装状态…"
              : "Loading installation state…"}
        </p>
      ) : (
        <>
          <div className="setup-grid">
            <section className="setup-card">
              <span className="step-number">01</span>
              <h2>{zh ? "安装在哪里？" : "Where should components live?"}</h2>
              <label className="field">
                <span>{zh ? "安装位置" : "Installation location"}</span>
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
                  ? "Windows 可填写 E:\\WSL\\apps\\x-dde；新组件使用 x-dde-managed 子目录。已有安装保留原目录。每个引擎的 Python 环境独立保存在 E 盘 WSL 中，研究资产由 X-DDE 统一管理。"
                  : "On Windows, E:\\WSL\\apps\\x-dde maps to WSL. New components use x-dde-managed; existing installations retain their location. Each engine has an isolated environment; X-DDE owns the research assets."}
              </p>
              <button
                disabled={busy || !location.trim()}
                onClick={() => void execute(save)}
              >
                {zh ? "保存位置" : "Save location"}
              </button>
            </section>
            <section className="setup-card">
              <span className="step-number">02</span>
              <h2>{zh ? "先从哪一步开始？" : "Choose a starting point"}</h2>
              <button
                className="setup-choice"
                disabled={busy}
                onClick={() =>
                  void execute(() => install(["ketcher", "molstar"]))
                }
              >
                <strong>
                  {zh
                    ? "先画分子、看结构"
                    : "Draw molecules, explore structures"}
                </strong>
                <span>
                  {zh
                    ? "推荐 · 安装 Ketcher 和 Mol*，不需要 GPU"
                    : "Recommended · Ketcher and Mol*, no GPU required"}
                </span>
              </button>
              <button
                className="setup-choice"
                disabled={busy}
                onClick={() =>
                  void execute(() => install(["ketcher", "molstar", "compute"]))
                }
              >
                <strong>
                  {zh
                    ? "安装 OpenDDE 计算套件"
                    : "Install the OpenDDE compute suite"}
                </strong>
                <span>
                  {zh
                    ? "编辑器 + Harness + OpenDDE + Docker 镜像；模型在下面单独选择"
                    : "Editors, Harness, OpenDDE and Docker image; choose models below"}
                </span>
              </button>
              <button
                className="setup-choice"
                disabled={busy}
                onClick={() => void execute(() => install(["diffsbdd"]))}
              >
                <strong>
                  {zh
                    ? "安装 DiffSBDD 小分子设计环境"
                    : "Install DiffSBDD for small-molecule design"}
                </strong>
                <span>
                  {zh
                    ? "独立科学环境，不依赖 OpenDDE；八种模型在组件库中按需选择"
                    : "Isolated scientific runtime, independent of OpenDDE; choose among eight models below"}
                </span>
              </button>
              <button className="text-button" onClick={onEditors}>
                {zh
                  ? "打开分子与结构 →"
                  : "Open molecule & structure workspace →"}
              </button>
            </section>
          </div>
          {(!data.prerequisites.docker || !data.prerequisites.uv) && (
            <aside className="notice">
              <strong>
                {zh ? "系统依赖待配置" : "System prerequisites needed"}
              </strong>
              <p>
                {zh
                  ? "uv 由工作台安装器提供；Ubuntu 的 Docker 可在终端使用下方命令安装。GPU 驱动和 NVIDIA Container Toolkit 请按 README 配置。"
                  : "The installer provides uv. For Docker on Ubuntu use the command below; configure the GPU driver and NVIDIA Container Toolkit as documented in README."}
              </p>
              <code>sudo $(command -v xdde) setup system</code>
            </aside>
          )}
          {data.restart_required && (
            <p className="notice">
              {zh
                ? "计算组件安装或卸载后，暂停剩余安装并执行 xdde restart 使配置生效。编辑器可以直接打开；安装成功不代表模型、GPU 或 Harness 服务已就绪。"
                : "After compute changes, pause remaining installations and run xdde restart. Editors open immediately. Installed does not imply models, GPU or Harness service are ready."}
            </p>
          )}
          <ComponentLibrary
            data={data}
            zh={zh}
            busy={busy}
            execute={execute}
            install={install}
          />
          <DeploymentActivity
            data={data}
            zh={zh}
            busy={busy}
            execute={execute}
          />
          <section className="command-reference">
            <h2>{zh ? "常用终端命令" : "Terminal quick reference"}</h2>
            <dl>
              {[
                ["X-DDE UI", "启动并打开浏览器", "Start and open browser"],
                [
                  "xdde dashboard",
                  "同上，大小写均可",
                  "Same on Windows; commands ignore case",
                ],
                [
                  "xdde stop",
                  "安全关闭；先暂停安装和计算",
                  "Stop safely; pause installs and tasks first",
                ],
                [
                  "xdde restart",
                  "重启并应用计算配置",
                  "Restart with updated compute configuration",
                ],
                ["xdde status", "查看服务状态", "Show service status"],
                ["xdde doctor", "检查系统依赖", "Check prerequisites"],
                ["xdde logs", "查看启动日志", "Read startup log"],
                [
                  "xdde ui --no-auto-deploy",
                  "启动但不自动创建安装任务",
                  "Start without scheduling automatic installs",
                ],
              ].map(([cmd, cn, en]) => (
                <div key={cmd}>
                  <dt>
                    <code>{cmd}</code>
                  </dt>
                  <dd>{zh ? cn : en}</dd>
                </div>
              ))}
            </dl>
          </section>
        </>
      )}
    </section>
  );
}
