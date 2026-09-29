# OpenDDE Workbench

[中文](#中文) · [English](#english)

An independent, MIT-licensed local workbench for OpenDDE predictions. It provides Chinese/English task entry, a durable queue, interactive 3D structures, computed descriptors, and downloadable results. The workbench runs only on your computer; it does not contain OpenDDE source, model weights, or an LLM service.

The owner-supplied image is retained as a color/style reference only. The interface is organized around verified engine capabilities, with separate guided task entry and interactive structure results. See [design and capability decisions](docs/design/README.md).

## 中文

### 功能与边界

- 本机 OpenDDE 标准/ABAG 结构预测：蛋白、SMILES/CCD 配体、DNA、RNA、常见离子及复合物；可设置种子、样本数、扩散步数、循环数和精度。
- 任务排队、取消、重试、服务重启后的状态恢复，日志和结构文件下载。
- 浏览器内旋转、缩放、色带/表面/配体球棍显示；按 3/4/5/6/8 Å 查看配体邻域和残基名称。支持原子/残基点选、搜索、定位、显示样式编辑、隐藏恢复、两点测距与构象叠加。显示编辑不会改动坐标或化学结构。
- 对真实输出计算 RDKit 分子性质、OpenDDE 原生置信度、结构 RMSD 和近邻接触；导出 CIF、CSV、HTML 报告。
- 本机项目分组与中英切换。无需 LLM 密钥即可使用上述能力。

### 普通用户的三步操作

1. 选择蛋白–小分子、蛋白、蛋白–蛋白、抗体–抗原、DNA/RNA 或小分子结构。按出现的输入框粘贴序列/单条 FASTA/SMILES；抗体任务自动选择已安装的 ABAG。首次可填入咖啡因检查流程。
2. 选“快速试跑”“标准预测（推荐）”或“多构象比较”，点击“开始预测”。默认简易模式；“专家微调”可调整数值、模型、组分和拷贝数，切换模式保留已填值。任务名称可自动生成。
3. 提交后进入“结构与结果”。点击构象查看结构，勾选 2–3 个构象叠加，点击附近残基定位。选择“配体与口袋”可调整邻域，预览下方可编辑显示与测距。专业指标旁的问号支持悬停、点击及键盘说明；导出页提供 CSV/HTML，构象行可下载 CIF。

快速试跑减少计算量，仅用于检查输入/流程。标准与多构象采用相同的单构象参数，多构象生成同一输入的 3 个结构，并非生成 3 个新化合物。未安装的可选模型不出现在新任务选项中。

当前安装**没有**标定的 kcal/mol 结合亲和力、小分子从头生成模型、完整 MSA/模板数据库或已配置的 LLM。页面明确提示这些边界，不把置信度冒充药效。计算结果并非实验验证。

### 环境要求

Linux 或 Windows WSL2（推荐 Ubuntu/systemd），Python 3.12、uv、Node.js 22、Docker、支持容器的 NVIDIA GPU、已安装的 OpenDDE 运行代码和 checkpoint。至少保留 2 GiB 空闲磁盘，模型和镜像另需数 GB。浏览器需支持 WebGL。首次部署需要准备引擎；准备好后普通用户在网页提交任务即可。

### 安装与启动

在 WSL/Linux 中执行：

```bash
git clone https://github.com/Victor-Xu-1/opendde-workbench.git
cd opendde-workbench/frontend
npm ci
npm run build
cd ..
uv sync --locked --group dev
cp .env.example .env
```

编辑 `.env` 为本机路径。`WB_IMAGE_FILE` 的内容是一行 **sha256 digest 固定**的 Docker 镜像引用；`WB_CODE_FILE` 的内容是一行 OpenDDE 运行代码目录路径。`WB_MODEL_DIR/checkpoint/opendde.pt` 必须存在，ABAG 模式另需 `opendde_abag.pt`。镜像应包含原版 OpenDDE 推理依赖及 RDKit、Biotite（用于结果分析）。确认 `docker image inspect "$(cat /path/to/image-reference.txt)"` 能找到镜像，`nvidia-smi` 可运行。`WB_STATE_DIR` 保存 SQLite、输入、日志和输出，须可写；在 E 盘支持的 WSL 发行版或 E 盘目录下配置。

```bash
set -a
. ./.env
set +a
uv run --locked opendde-workbench --port 4320
```

打开 `http://127.0.0.1:4320/`。先在“运行状态”确认引擎就绪，再一键载入咖啡因示例，或录入自己的蛋白/小分子。网页关闭后队列继续运行，任务中心可恢复查看。服务绑定 loopback，同源 CSRF 保护写操作；请仅在可信的单用户电脑上使用，**不要直接开放公网**。

这台设备的 E 盘部署另有 `E:\OpenDDE\Start-Workbench.cmd` 启动器；它和 `E:\OpenDDE\deployment\workbench.env` 属于个人部署文件，不进入公开仓库。用户双击启动器即可打开工作台。

### 验证与构建

```bash
cd frontend
npm run check
npm test
npm run build
cd ..
uv run --locked ruff check src tests
uv run --locked pytest -q
uv build --wheel
```

Python 单元/API 测试以可控的真实子进程检验队列和文件协议，不消耗 GPU；科学推理需在有镜像与模型的设备上由网页提交任务验证。CI 执行前后端检查、测试和 wheel 构建。wheel 内包含构建后的前端和独立查看器。任务数据不进 Git 仓库。

### 架构与排错

`frontend/src/studio` 是界面模块；`frontend/src/guided` 定义工作流、组分和预设；`frontend/src/viewer` 按协议、几何选择、场景显示和 UI 控件拆分隔离的 3Dmol 查看器；`src/opendde_workbench/api.py` 定义本地 API；`store.py`/`worker.py` 管理持久队列；`engine.py` 用 digest 固定的外部容器运行 OpenDDE；`analysis.py`/`compute_analysis.py` 在同一科学环境计算结果。输入经 Pydantic 校验，结构下载经目录边界检查。项目元数据和任务共用 SQLite，预测输出保留在 `WB_STATE_DIR`。

- “引擎未就绪”：检查 Docker、GPU、镜像引用、运行代码和 checkpoint 路径；`GET /api/health` 返回原因。
- 预测失败：任务中心查看任务日志；8 GB 显存优先 BF16、单样本、短序列。分析失败不会删除预测文件。
- 查看器空白：检查 WebGL、结构下载和 `/viewer.html`；请从已完成任务重新加载结构。
- 分析失败：检查任务 `analysis-error.log`、镜像内 RDKit/Biotite 和 2 GiB 容器内存上限。
- 端口被占用：工作台默认 4320；更改端口时同步更新 `WB_ALLOWED_ORIGINS`，仍只绑定 loopback。

更新时备份 `WB_STATE_DIR`，停止服务，更新代码并重跑 `npm ci && npm run build`、`uv sync --locked`，再启动。回退代码不自动迁移或删除任务数据；重大升级前应保留 SQLite 备份。

### 授权与数据来源

工作台原创源码采用 [MIT](LICENSE)。OpenDDE 与独立 Harness 的代码、权重和许可证由各自上游管理，未并入本仓库。固定设计图由项目所有者提供；其中第三方图形和标识不因本仓库的 MIT 声明而重新授权。旧版的 PDB 示例卡片与静态结构资产已移除。

## English

Install OpenDDE and a digest-pinned GPU Docker image first. In `frontend`, run `npm ci && npm run build`; at the root run `uv sync --locked --group dev`, configure `.env` from `.env.example`, and launch `uv run --locked opendde-workbench --port 4320`. Visit `http://127.0.0.1:4320/`. The interface switches between Chinese and English. Native confidence, RDKit descriptors, contacts, exports, and reports come from completed predictions. Six guided workflows cover protein–ligand, protein, protein–protein, antibody–antigen, DNA/RNA and ligand-only inputs. Expert mode exposes model/numeric settings and all five native entity types. Pocket controls show geometric neighborhoods around an existing ligand; display editing and distance measurements do not modify input chemistry or coordinates. Calibrated affinity, small-molecule generation, local MSA databases, and an LLM provider are not bundled. Covalent bonds, modified residues and user-uploaded MSA/template inputs are not exposed by this adapter. Use the verification commands above; CI exercises the non-GPU suite.
