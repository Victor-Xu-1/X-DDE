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
        data.config.root?.replace(/\/opendde-managed$/, "") ??
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
        <span className="eyebrow">WORKSPACE SETUP</span>
        <h1>{zh ? "准备好你的研究工作台" : "Make room for discovery"}</h1>
        <p>
          {zh
            ? "选择位置，再选你需要的能力。下载和安装会在后台进行，你可以继续浏览工作台。"
            : "Choose a location and the capabilities you need. Installation continues in the background."}
        </p>
      </header>
      {(message || error) && (
        <p className="error" role="alert">
          {message || error}
        </p>
      )}
      {!data ? (
        <p role="status">
          {zh ? "正在读取安装状态…" : "Loading installation state…"}
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
                  placeholder="E:\\OpenDDE"
                />
                <datalist id="install-locations">
                  {data.locations.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </label>
              <p className="field-help">
                {zh
                  ? "Windows 可填写 E:\\OpenDDE；WSL 中对应 /mnt/e/OpenDDE。管理其中的 opendde-managed 子目录。Python 客户端保存在 WSL Linux 磁盘中，研究结果另行保存。"
                  : "On Windows, E:\\OpenDDE maps to /mnt/e/OpenDDE. Bulk components use its opendde-managed subfolder; Python environments use the WSL Linux disk. Research results are separate."}
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
                  {zh ? "准备完整计算环境" : "Prepare the compute environment"}
                </strong>
                <span>
                  {zh
                    ? "编辑器 + Harness + OpenDDE + Docker 镜像；模型在下面单独选择"
                    : "Editors, Harness, OpenDDE and Docker image; choose models below"}
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
