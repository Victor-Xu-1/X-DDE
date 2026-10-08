# 开发与发布

[返回项目介绍](../README.md) · [仓库工程要求](../AGENTS.md) · [科学与服务器验收](server-acceptance.md)

X-DDE 的科学能力来自明确的请求契约、同一任务路由和独立科学环境。新增或替换软件需接入现有注册表、BackendRouter、Store/Worker 和研究资产管理；不要另外实现一套竞争性的工作台、任务队列或数据管理。

## 验证改动

按改动范围运行组件及直接使用者的专项检查。没有明确授权，不运行全仓库测试。前端构建与静态检查可以本地完成；所有者共享机器上的科学推理、GPU 或完整模型验收留给 CI / 目标服务器。

```bash
npm ci --prefix frontend
npm run check --prefix frontend
npm run build --prefix frontend
```

选择受影响的具体 Vitest、pytest 或浏览器检查，不使用没有文件选择的全量测试命令。运行环境、原生结果、浏览器行为与科学结论分别记录；界面截图不能替代模型验收。

能力或 DiffSBDD 参数契约变化后，用 `scripts/generate-capability-catalog.py` 同步前端目录；其 `--check` 模式验证现有目录与后端权威是否一致。

## 发布编号

`pyproject.toml` 是版本权威。每次向 main 推送可发布更新，版本末位递增一次；同一候选批次的修正保留该版本。

```bash
uv run --locked python scripts/release-version.py bump
uv run --locked python scripts/release-version.py check --base PREVIOUS_MAIN_SHA
```

末位范围为 0–100，中间位范围为 0–10：`0.1.99 → 0.1.100 → 0.2.0`，`0.10.100 → 1.0.0`。编号是发布计数，独立于科学验收和数据契约。

审核改动与专项 CI 后，使用现有 **Release installers** 工作流，在已审核 main 上指定匹配的数字标签。流程构建前端和 wheel，验证版本、不可变校验和与 Windows 入口，再发布安装文件；不自动递归运行全部科研模块。

更新前检查工作台拥有的活动任务，备份状态与原始资产。安装精确提交对应的发行包，验证页面资源与发布包一致，并检查历史数据和独立科学环境保持完整。不要重启共享 WSL 或停止其他应用来完成界面升级。

README 中的实际截图来自同一已审核提交的真实浏览器证据。更新截图时保留其公开案例、原生数据与截图版本，不能把生成的设计图片标成运行页面。
