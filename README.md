# X-DDE

[中文](#中文) · [English](#english) · [能力与源码对照](docs/design/README.md) · [服务器验收](docs/server-acceptance.md)

X-DDE is an independent Apache-2.0 drug research platform. X-DDE owns both its frontend and unified backend. OpenDDE, DiffSBDD, Harness, editors and other integrated software are managed environments/components beneath the platform; their native scientific programs, dependencies, models and licenses retain their actual identities.

**平台关系：X-DDE 负责前端和后端，其余软件均作为集成环境。** X-DDE 后端拥有公共 API、业务规则、项目、任务、科学对象、版本、工作流、环境管理与证据。集成环境提供真实科学程序、模型和依赖，不拥有平台业务或数据权威。

环境准备和科学执行分别接入：**X-DDE 环境管理 → 配置适配器 → 集成环境**；**X-DDE 科学任务 → 科学/执行适配器 → 环境中的真实程序 → X-DDE 资产与证据**。产品中的 OpenDDE 环境配置接口当前使用已审查的 OpenDDE Harness 安装器，只有源码准备、镜像校验和模型资源准备等实际支持的动作。暂停、取消、重试、升级与卸载的部署策略和进程管理由 X-DDE 承担，不虚构上游 API。DiffSBDD、编辑器和 Harness 客户端使用各自实际安装配方，不要求通过 OpenDDE 配置。

已有 OpenDDE 原生预测与化学工具继续通过 X-DDE 科学适配器执行；原生 Harness 流程保留内部运行机制，X-DDE 管理顶层业务与引用。运行状态页以集成环境组织信息，配置工具来源收在详情中。平台就绪、配置客户端可用、环境/模型就绪和科学验收互相区分。

科学运行在既有任务数据库中绑定不可覆盖的环境元数据版本，并分别记录环境准备来源与实际科学软件。`GET /api/jobs/{id}/environment` 返回该记录；历史未登记任务返回明确的 404。该记录是安装/配置元数据快照，不声称冻结管理员外部修改的环境文件或验证所有模型权重；实际原生来源、摘要和科学验证范围仍须核对。部署 API 继续保护排队/运行中的科学任务，不能在使用中更新组件。

新组件目录使用 `x-dde-managed`，旧安装与研究数据原位保留。WSL 的历史发行版名称、Python 内部包名和原生 CLI 不代表平台所有权。

平台使用统一项目、科学资产版本和来源关系组织研究。结构、分子、序列和分析结果能通过实际输入输出关联，修改保留原始版本。正在开发的资产网络与 DiffSBDD 集成状态、模块边界及服务器验收要求见[权威架构说明](docs/design/README.md#x-dde-平台架构与资产关系)，候选分支能力不等于已发布能力。

**0.4 release candidate:** guided installation, background component management, terminal start/stop, Ketcher and Mol* are available. Scientific GPU, multi-GPU, MSA/template databases, remote services and real LLM campaigns still require target-server acceptance. Installation success is not scientific readiness.

## 简单安装 / Quick installation

从 [GitHub Releases](https://github.com/Victor-Xu-1/X-DDE/releases) 下载 `install.ps1`（Windows）或 `install.sh`（Linux）。安装器下载带校验和的发行包，不需要编译前端，也不要求安装 Node.js。

Windows PowerShell：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
X-DDE UI
```

已安装 WSL 的用户可指定发行版、Linux 用户和 E 盘位置：

```powershell
.\install.ps1 -Distribution OpenDDE -LinuxUser opendde -InstallRoot E:\WSL\apps\x-dde
```

Windows 安装器使用 Windows 网络下载并校验发行文件，交给 WSL 安装；无需先调整 WSL 的 GitHub 代理。默认入口为 `E:\WSL\apps\x-dde`；E 盘不可用时会停止并提示明确选择安装位置，不会静默写入 C 盘。升级会复用该目录保存的发行版和 Linux 用户。默认布局中新建的 WSL 磁盘位于 `E:\WSL\distros`；选择 E 盘安装目录时会核对已有发行版的真实注册位置，已有磁盘不自动迁移。Python 程序环境安装到 WSL 的 Linux 磁盘，避免 Windows 挂载盘不支持 Linux 符号链接导致安装失败。安装与启动的 Windows 临时文件放在安装目录的 `tmp`，Linux 安装临时文件及缓存留在 Linux 程序目录。模型、代码缓存与编辑器目录可在面板另选。Windows 首次启用 WSL2 可能需要管理员操作和重启；安装器会显示准确的后续步骤，不会删除现有发行版。[WSL 官方安装命令](https://learn.microsoft.com/en-us/windows/wsl/basic-commands)。Windows 命令名和参数均忽略大小写；在新的终端中可直接使用 `X-DDE UI`、`xdde dashboard`。

Linux x86-64 / WSL2：

```bash
bash install.sh
export PATH="$HOME/.local/share/opendde-workbench/app/bin:$PATH"
X-DDE UI
```

主命令为 `X-DDE UI`、`x-dde ui` 或 `xdde dashboard`。之前的 `OpenDDE UI`、`opendde dashboard`、`OPENDDE UI` 均指向同一启动器；命令参数不区分大小写。再次运行安装器即可更新工作台，研究数据不随程序更新移除。

| 命令 / Command | 作用 / Behavior |
| --- | --- |
| `X-DDE UI` / `xdde dashboard` | 后台启动，自动打开浏览器 / Start and open browser |
| `xdde stop` / `X-DDE UI close` | 安全关闭；正在运行的任务或安装需先停止/暂停 |
| `xdde restart` | 重启并载入新的计算组件配置 |
| `xdde status` | 查看端口和服务状态 |
| `xdde logs` | 查看最近的启动日志 |
| `xdde doctor` | 检查系统与服务配置 |
| `xdde ui --port 4321` | 选择其他本地端口 |
| `xdde ui --no-auto-deploy` | 首次启动不自动创建安装任务 |
| `xdde ui --no-browser` | 启动但不打开浏览器 |

首次使用：打开左侧底部 **账户与设置 → 安装与组件 → 选择位置 → 选择方案**。默认启动会后台安排编辑器、Harness、OpenDDE 原生代码和计算镜像，模型权重需要单独选择。下载需要能访问 GitHub、npm、PyPI 和 Docker Hub；失败会保留诊断并提供重试。`--no-auto-deploy` 适合只看界面或先选择其他磁盘。

核心科研入口保留在主导航；工作空间概况、安装、运行状态和帮助位于底部管理菜单。**账户与设置**可切换中文/英文及暖色、纯白、夜间黑主题，偏好保存在当前浏览器；账户信息反映现有本地单用户模式。

Core research tools remain in the main navigation. The bottom **Account & settings** menu groups workspace overview, installation, runtime status and help. Open its settings page to choose Chinese/English and Warm/Pure white/Night appearance; preferences are saved in the current browser. Account information reflects the existing local single-user mode.

部署状态由 SQLite 保存。暂停会终止该安装步骤的子进程；继续时复用已验证下载和完整 Docker 层，部分步骤可能从头执行。Docker 守护进程可能在客户端暂停后短暂完成当前层。升级仅使用工作台组件目录审核过的版本；更新工作台可以获取新目录。卸载移除独立编辑器/客户端安装文件并停用组件，保留研究结果、模型、下载缓存、原生源码缓存和共享 Docker 镜像。新位置的组件目录由 X-DDE 标记归属；升级复用已有目录与归属标记，不自动搬动环境或研究数据。同一位置同时存在新旧组件目录时拒绝猜测，提示管理员核对。更改安装位置不自动迁移已有数据。

Ubuntu 系统依赖：`sudo $(command -v xdde) setup system` 安装 Docker 与基础工具；Docker 用户访问按 [Docker 官方说明](https://docs.docker.com/engine/install/linux-postinstall/) 配置，GPU 按 [NVIDIA Container Toolkit 官方说明](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) 配置。网页不自动获得管理员权限。Harness 计算服务、共享目录和 LLM 凭据仍在下方环境配置中设置；不会把“已安装”显示成“已能推理”。

**分子与结构**：Ketcher 画分子、打开 MOL/SDF/SMILES、保存到工作台分子库、交接性质计算；Mol* 打开本地蛋白/复合物、查看序列、选择残基、修改显示与导出视图。Mol* 的显示编辑不是蛋白序列设计或结构能量优化。编辑器依赖在本机托管；Mol* 运行在独立的浏览器沙箱中，不能读取工作台会话和上传库。两者保留各自上游许可证，Apache-2.0 仅覆盖本平台自有代码。

改名保留原内部模块与数据目录，已有记录不需要迁移。安装状态和数据默认保存在 `~/.local/share/opendde-workbench`，可用 `WB_HOME` 和 `WB_STATE_DIR` 覆盖。计算组件更改后执行 `xdde restart`；显式 `WB_*` 设置优先于组件管理器。仅监听本机环回地址，服务器远程使用请通过 SSH 隧道。

## 中文

### 从研究目标进入

“全部能力”按设计、结构预测、性质与评分、分析、检索、输入准备、资源配置组织入口。

- **小分子研究：**直接批量计算 SMILES/SDF 的 MW、LogP、TPSA、QED、SA、HBD/HBA 和可旋转键；预测小分子或蛋白–配体结构；查看配体口袋、原生置信度、构象叠加、RMSD 和近邻接触。
- **抗体设计：**使用 Harness 原生 VHH、scFv、VH/VL 设计流程；选择 CDR 和固定位置，审阅目标与计算预算后启动。查看轮次、阶段、候选和结构；调整后续提案数/反思间隔，停止任务，生成表位、相互作用和完整搜索历史分析。
- **序列与候选工具：**ESM2 评分、ESM2 引导提案、SolubleMPNN、候选折叠与评分、ProTrek 序列/结构检索、表位/PLIP 分析、目标对齐后的结合链 RMSD、进化分析、两次候选集比较。
- **完整原生输入：**蛋白、小分子、DNA、RNA、CCD 离子；链 ID/拷贝、残基修饰、单记录三维配体文件、共价连接、已上传 MSA/模板；PDB/CIF 转换、原生 JSON 导入和批量提交。已有结果可直接转为下一步输入。
- **特征与计算控制：**MSA、MSA＋模板、完整蛋白/模板/RNA 特征准备；多种子、TFG、原子置信度、CPU/CUDA、计算内核、缓存/融合/TF32、确定性设置、FoldCP 和服务器登记的自定义 checkpoint。

普通模式提供表单与预设，专业术语带说明；专家模式开放科学参数。抗体序列点选使用从 **1** 开始的编号，提交时转换为 Harness 原生的从 **0** 开始的编号。OpenDDE 共价连接使用其原生的从 **1** 开始的实体/拷贝/位置编号。专家 JSON 遵循所选工具的原生契约。

三维查看器保留蓝白配色、配体球棍、柔和色带、邻域残基、点选、搜索、显示编辑、隐藏/恢复和两点测距。输入原子检查用于拓扑编辑，**不是**预测结合姿势。显示样式编辑不改变坐标；共价编辑器明确生成新的输入连接。

### 能力边界

公开的 OpenDDE 是结构预测/共折叠引擎；Harness 提供抗体设计流程和相应工具。审计版本没有独立的通用小分子从头生成、完整 ADMET 或经过校准的结合亲和力模型。QED/SA/LogP 是计算描述符，不是实验药效。

Harness 的 `developability_filter.py` 在公开版本中是返回 `available: false` 的空实现，因此不提供“客观可开发性预测”按钮。设计流程可使用其原生 LLM 质量判断，来源与不确定性须保留。原生服务返回 unavailable 时，工作台保留失败/不可用信息，不编造结果。

### 环境和安装

目标环境为 Linux 或 Windows WSL2、Python 3.12、Node.js 22、uv、Docker。CUDA 预测需 NVIDIA 容器支持；CPU 模式和 RDKit 性质任务不要求 GPU。FoldCP 需至少两张 GPU。模板/RNA 数据库由管理员安装或从资源页明确下载，不在普通预测中自动安装。搜索数据库整包需要至少 110 GiB 空间，镜像需包含 zstd、HMMER、kalign。

以下命令在**目标服务器**执行；本次版本的完整部署验收尚待执行：

```bash
git clone https://github.com/Victor-Xu-1/X-DDE.git
cd X-DDE
git checkout main
cd frontend
npm ci
npm run build
cd ..
uv sync --locked --group dev
cp .env.example .env
```

配置含义：

| 设置 | 内容 |
| --- | --- |
| `WB_STATE_DIR` | 可写数据目录：SQLite、不可变上传、任务快照、结果、设计交接记录。 |
| `WB_IMAGE_FILE` | 文本文件，内容为带 `@sha256:` 的固定 Docker 镜像引用。 |
| `WB_CODE_FILE` | 文本文件，内容为外部运行代码根目录；包含 `external/opendde/runner/batch_inference.py`。 |
| `WB_MODEL_DIR` | OpenDDE 的 `checkpoint/`、`common/`、`search_database/` 根目录。 |
| `WB_CACHE_DIR` | 可写计算缓存。 |
| `WB_MSA_URL` | 可选的管理员配置 MSA 服务；未设时由原生运行环境采用其默认服务。 |
| `WB_CHECKPOINTS_FILE` | 可选 JSON，映射自定义 ID 到 checkpoint 目录内的 `.pt` 文件名；不接受客户端任意路径。 |
| `WB_HARNESS_PYTHON` | **已安装 OpenDDE Harness 的独立 Python 解释器**。工作台不复制或替代原生代理。 |
| `WB_HARNESS_URL` / `WB_HARNESS_TOKEN` | 固定计算服务地址和服务端凭据；浏览器不接收令牌。 |
| `WB_HARNESS_SHARED_DIR` | 工作台主机上可访问的 Harness 计算输出根目录。文件工具需共享挂载，并以相同服务 UID 读写共享输入。 |
| `WB_HARNESS_REMOTE_DIR` | 同一个目录在计算服务主机/容器内的绝对路径；同路径时可留空。 |
| `WB_DIFFSBDD_PYTHON` / `WB_DIFFSBDD_SOURCE` | DiffSBDD 独立解释器与经过审查的原生源码；安装管理会自动记录。 |
| `WB_DIFFSBDD_HOME` / `WB_DIFFSBDD_MANIFEST_SHA256` | DiffSBDD 运行根目录与可信安装清单摘要；仅管理员覆盖，不接受浏览器任意路径。 |

OpenDDE 镜像须包含其推理依赖、RDKit 和 Biotite。`WB_MODEL_DIR/checkpoint/opendde.pt` 和可选的 `opendde_abag.pt` 为对应预测所需权重。公开源码、权重、数据库和模型服务均不打包进此仓库。

Harness 的 LLM、工具模型与计算池按上游安装文档配置。启动工作台的用户必须能够读取该用户的默认 `~/.opendde_harness/config.json`；原生 detached worker 使用这个默认配置。不要把真实凭据放进设计 JSON/YAML。可在服务器 `.env` 设置 `OPENDDE_HARNESS_PROTEIN_DESIGN_ROOT` 指定原生任务目录。

自定义 checkpoint 注册示例（文件由管理员管理）：

```json
{"my_finetuned_model": "my_finetuned_model.pt"}
```

启动：

```bash
set -a
. ./.env
set +a
uv run --locked x-dde-server --port 4320
```

工作台仅绑定 `127.0.0.1`，采用同源 CSRF 和 Host 校验。服务器使用 SSH 转发访问：

```bash
ssh -L 4320:127.0.0.1:4320 USER@SERVER
```

浏览器打开 `http://127.0.0.1:4320/`。这是单用户研究工作台；不要直接作为无鉴权公网服务暴露。E 盘支持的 WSL 发行版仍可保存代码、模型和数据，程序更新前需安全关闭正在运行的服务。

### 验证、构建与部署

单维护者阶段采用直接提交主分支、简短源码审查、相关检查通过后发布。后续其他线程的独立优化可提交 PR，由主维护者审核并线。

```bash
cd frontend
npm run check
npm test
npm run build
cd ..
uv run --locked ruff check src tests server_tests
uv run --locked pytest -q
uv build --wheel
```

CI 使用真实 SQLite、文件和受控子进程检查应用协议，不验证科学推理。真实科学运行与浏览器验收见 [服务器验收说明](docs/server-acceptance.md)。新增测试已提供；本机未运行测试套件或推理。每个发布候选都必须通过其精确提交对应的 CI。

浏览器 CI 使用独立临时服务和锁定的 `browser` 开发依赖，验证三种主题、资产页文字对比度、窄屏布局、管理菜单、备注版本持久化、中英文刷新和指定分子的性质输入交接。测试只登记小型输入资产，不提交科学计算任务；截图和日志保存在 CI 附件中，不进入仓库或发行包。共享界面样式按职责拆分在 `frontend/src/design/`，颜色统一来自 `tokens.css`，资产页使用同一套语义颜色。

部署前备份 `WB_STATE_DIR` 并停止工作台，确认原生设计任务已结束或明确交接；构建并安装精确提交对应的 wheel 后启动。0.3 只新增 `assets`、`batches`、`design_plans`、`queue_control` 表，保留旧任务。回退到 0.2 前须使用升级前的数据备份：0.2 不认识新增任务类型。不要直接删除共享模型、原生 Harness 任务或用户数据。

### 架构和故障恢复

- `frontend/src/operations`：能力目录、各任务表单、文件/原子/残基选择、原生参数编辑、设计计划和结果展示。
- `entities` / `parameters` / `prediction` / `requests`：显式输入契约；`native_arguments` / `native_task` 只调用固定版本的原生命令。
- `store` / `worker`：单一持久队列，批次原子提交，有限日志、超时、取消和重启恢复。普通预测/资源任务等待本工作台发起的原生设计结束，避免争抢同一计算资源；外部手动启动的进程仍需管理员协调。
- `assets`：UUID 输入、类型/大小限制、SHA-256 快照、引用保护、结果复用和路径边界检查。
- `harness_contract` / `harness_compute`：科学工具白名单、原生请求校验、管理路径映射、固定服务地址、原生计算客户端。
- `harness_service` / `harness_bridge`：审阅计划与幂等交接，实际生命周期、种群和代理循环始终属于原生 Harness。响应丢失时核对已有任务，禁止自动重复启动。
- `analysis` / `molecule_math` / `confidence`：真实描述符、唯一的多种子构象标识、原生 PAE/PDE/接触概率与逐原子置信度。

常见恢复路径：

- **资源缺失：**到资源页检查文件状态；存在状态不是哈希或科学准确性验证。检查 Docker、代码根目录和模型文件。
- **Harness 不可用：**检查解释器、默认原生配置、固定服务地址/令牌以及共享存储映射；不要把服务器路径填写到浏览器参数中。
- **设计启动状态不确定：**在“抗体设计 → 恢复未启动/待核对计划”恢复计划并核对。原生启动仍在运行时不能重复启动；已无原生任务时恢复为待审阅状态。
- **不能取消同步工具：**原生 ESM/分析等同步接口派发后没有取消协议；队列中可取消，派发后等待返回。异步折叠支持取消；远端取消无法确认时暂停队列，先检查原生服务。
- **多记录 SDF：**性质计算支持多记录；结构预测的每个配体须为单个三维记录，不会悄悄只读取第一条。
- **大置信度文件：**交互读取最多 64 MiB，矩阵按明确间隔取样；完整文件仍可下载，坐标为原生 token 索引。
- **旧浏览器页面没有新功能：**先查看 `xdde version`、`xdde status`，更新后执行 `xdde restart` 并刷新浏览器。

## English

The capability matrix records currently integrated software and audited upstream source. The implemented adapters, available UI and pending integration work are distinguished in [the matrix](docs/design/README.md); runtime and scientific acceptance depend on the selected engine and target server. X-DDE has its own platform server independently of these environments. The audited OpenDDE/Harness distribution does not provide objective developability, generic small-molecule de novo generation, complete ADMET or calibrated affinity. These are current integration boundaries, not restrictions on X-DDE's platform architecture; additional software requires a real adapter and acceptance evidence.

Install/build using the commands above, configure `.env.example`, and run the app on loopback. For Harness, configure an existing native installation and its default provider configuration. Scientific file tools require a shared directory mapped to the compute output root. The browser uses uploaded IDs, not filesystem paths or credentials. Native campaigns retain their own lifecycle; Workbench stores reviewed handoffs and never implements a second agent loop.

0.4 remains a release candidate until the target-server matrix, native inference and service/LLM calls pass. See [server acceptance](docs/server-acceptance.md). Local acceptance covers installation, lifecycle and browser/editor behavior; it does not establish scientific inference readiness.

## License and provenance

X-DDE original code is [Apache-2.0](LICENSE), with attribution retained in [NOTICE](NOTICE). [OpenDDE](https://github.com/aurekaresearch/OpenDDE) and [OpenDDE Harness](https://github.com/aurekaresearch/OpenDDE-Harness) remain external dependencies under their upstream licenses. The owner-provided reference image is retained for style only; its third-party artwork and marks are not relicensed by the code license. No upstream model weights, private data, secrets or proprietary editor implementation are included.

The current source uses Apache-2.0. Previously published MIT releases retain the license distributed with those releases; third-party code and models are not relicensed.
