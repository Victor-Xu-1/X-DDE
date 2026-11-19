import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);

export class Lifecycle {
  constructor(config, dependencies = {}) {
    this.config = config;
    this.execute = dependencies.execute || execute;
    this.fetch = dependencies.fetch || fetch;
    this.desired = false;
    this.generation = 0;
    this.phase = "stopped";
    this.error = null;
    this.job = null;
    this.transition = Promise.resolve();
    this.polling = false;
    this.lastActivity = Date.now();
    this.failures = 0;
    this.timer = null;
  }
  state() {
    return {
      phase: this.phase,
      enabled: this.desired,
      error: this.error,
      job: this.job,
      device: "CPU",
      version: this.config.version,
    };
  }
  async command(action) {
    await this.execute(
      "wsl.exe",
      [
        "-d",
        this.config.distro,
        "-u",
        "root",
        "--cd",
        "/",
        "--exec",
        "/usr/bin/systemctl",
        action,
        "decimer-worker.service",
      ],
      { windowsHide: true, timeout: 45000, maxBuffer: 256 * 1024 },
    );
  }
  setEnabled(value) {
    if (this.desired === value && this.phase !== "error") return this.state();
    const generation = ++this.generation;
    this.desired = value;
    if (value && !this.timer) {
      this.timer = setInterval(() => void this.tick(), 1000);
      this.timer.unref();
    }
    if (!value) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.error = null;
    this.phase = value ? "starting" : "stopping";
    if (!value) this.job = null;
    this.lastActivity = Date.now();
    this.deadline = Date.now() + 180000;
    this.transition = this.transition
      .catch(() => {})
      .then(async () => {
        if (generation !== this.generation) return;
        await this.command(value ? "start" : "stop");
        if (generation !== this.generation) return;
        this.phase = value ? "loading" : "stopped";
        this.failures = 0;
      })
      .catch((error) => {
        if (generation === this.generation)
          this.fail(
            `识别服务${value ? "启动" : "关闭"}失败，请查看本地日志。`,
            error,
          );
      });
    return this.state();
  }
  fail(message, error) {
    this.generation++;
    this.desired = false;
    clearInterval(this.timer);
    this.timer = null;
    this.phase = "error";
    this.error = message;
    this.job = null;
    console.error(message, error?.message || "");
    // A failed model must not remain resident after an error is shown.
    this.transition = this.transition
      .catch(() => {})
      .then(() => this.command("stop"))
      .catch((stopError) =>
        console.error("Worker cleanup failed:", stopError.message),
      );
  }
  async worker(path, options = {}) {
    return this.fetch(`http://127.0.0.1:${this.config.workerPort}${path}`, {
      ...options,
      headers: {
        ...options.headers,
        authorization: `Bearer ${this.config.workerToken}`,
      },
      signal: AbortSignal.timeout(12000),
    });
  }
  async tick() {
    if (!this.desired || this.polling || this.phase === "starting") return;
    if (
      this.job?.status !== "running" &&
      Date.now() - this.lastActivity > 600000
    ) {
      this.setEnabled(false);
      return;
    }
    this.polling = true;
    const generation = this.generation;
    try {
      const response = await this.worker("/api/heartbeat", { method: "POST" });
      if (!response.ok) throw new Error(`Worker HTTP ${response.status}`);
      const state = await response.json();
      if (generation !== this.generation || !this.desired) return;
      this.failures = 0;
      if (state.phase === "error") {
        this.fail(state.error || "模型加载失败。");
        return;
      }
      this.job = state.job;
      this.phase =
        state.phase === "ready" && this.job?.status === "running"
          ? "busy"
          : state.phase;
      if (this.phase === "loading" && Date.now() > this.deadline)
        this.fail("模型启动超时，识别服务已关闭。");
      if (
        this.job?.status === "running" &&
        Date.now() - this.job.startedAt * 1000 > 180000
      )
        this.fail("识别超时，识别服务已关闭。");
    } catch (error) {
      if (generation !== this.generation || !this.desired) return;
      this.failures++;
      if (
        Date.now() > this.deadline ||
        (["ready", "busy"].includes(this.phase) && this.failures >= 3)
      )
        this.fail("识别服务连接中断，已关闭后端。", error);
    } finally {
      this.polling = false;
    }
  }
  close() {
    clearInterval(this.timer);
  }
}
