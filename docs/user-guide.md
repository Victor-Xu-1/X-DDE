# X-DDE 使用与运行

[返回项目介绍](../README.md) · [安装与科学环境验收](server-acceptance.md)

这里说明安装、启动、输入与环境连接。研究流程、页面展示和平台架构见项目首页。

## 安装、启动与界面

从 [GitHub Releases](https://github.com/Victor-Xu-1/X-DDE/releases) 下载 `install.ps1`（Windows）或 `install.sh`（Linux）。安装器下载带校验和的发行包，不需要编译前端，也不要求安装 Node.js。

Windows PowerShell：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
X-DDE UI
```

已安装 WSL 的用户可指定发行版、Linux 用户和 E 盘位置：

```powershell
.\install.ps1 -Distribution WSL -LinuxUser opendde -InstallRoot E:\WSL\apps\x-dde
```

Windows 安装器使用 Windows 网络下载并校验发行文件，交给 WSL 安装；无需先调整 WSL 的 GitHub 代理。默认入口为 `E:\WSL\apps\x-dde`；E 盘不可用时会停止并提示明确选择安装位置，不会静默写入 C 盘。升级会复用该目录保存的发行版和 Linux 用户。默认布局中新建的 WSL 磁盘位于 `E:\WSL\system`；选择 E 盘安装目录时会核对已有发行版的真实注册位置，已有磁盘不自动迁移。Python 程序环境安装到 WSL 的 Linux 磁盘，避免 Windows 挂载盘不支持 Linux 符号链接导致安装失败。安装与启动的 Windows 临时文件放在安装目录的 `tmp`，Linux 安装临时文件及缓存留在 Linux 程序目录。模型、代码缓存与编辑器使用面板统一选择的组件目录；Linux 可执行环境保留在同一 WSL 的 Linux 存储中。Windows 首次启用 WSL2 可能需要管理员操作和重启；安装器会显示准确的后续步骤，不会删除现有发行版。[WSL 官方安装命令](https://learn.microsoft.com/en-us/windows/wsl/basic-commands)。Windows 命令名和参数均忽略大小写；在新的终端中可直接使用 `X-DDE UI`、`xdde dashboard`。

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

首次使用：打开左侧底部 **设置与帮助 → 安装与运行 → 组件安装**。在页面顶部选择统一安装目录，再从基础与预览、口袋/对接/性质、结构预测、分子生成、抗体与生物药等用途组选择“部署推荐组合”，也可单独安装。组合部署先读取最新安装状态，只补齐缺失项；依赖仍由 X-DDE 后端的同一安装队列处理，暂停、继续使用现有操作。OpenDDE 推荐计算环境与标准模型，DiffSBDD 推荐独立环境与 CrossDocked Cα 条件模型；抗体模型、其他权重及大型搜索数据库按需选择。每个集成环境仍独立安装，不合并其依赖环境。

组件页使用全宽自适应多列卡片和用途筛选。已安装组件的主按钮为不可重复部署的“已安装”，修复、升级、卸载与许可证详情收在“维护”。统一安装目录直接显示，可选推荐目录或填写绝对路径；Windows 路径自动转换为 WSL 路径。已有组件或未结束的部署会锁定目录，不会自动搬动环境。普通用户页面不显示安装历史、终端命令、原始 JSON、哈希或工程附件；排队、运行、暂停及最新失败仍直接显示。组合提交部分失败时刷新真实进度，重新部署只补齐剩余项，不重装已有组件。安装成功和科学计算就绪分别显示。

默认启动仍会后台安排编辑器、Harness、OpenDDE 原生代码和计算镜像，模型按组合或单项选择。下载需要能访问 GitHub、npm、PyPI 和 Docker Hub；失败会保留诊断并提供重试。`--no-auto-deploy` 适合只看界面或先选择其他磁盘。

配体预览使用适度加粗的绿色棒状结构和元素配色，覆盖独立分子、蛋白复合物、叠加、区域与点选高亮；Mol* 共用 0.14 棒半径，Ketcher 保留原生细线。显示样式不改变原始坐标和键级。

点击“分子表面”直接显示部分电荷着色：负电红色、近零白色、正电蓝色，固定范围 ±0.6 e。优先读取明确提供的有限部分电荷，蛋白标准氨基酸可用 3Dmol 原生电荷表近似；输入的无效电荷不替换为估算，MOL2 `NO_CHARGES` 不视为有效电荷。无数据原子为灰色，覆盖数量和来源可通过图例说明查看。独立分子和实际对齐的受体/配体也可打开表面，真正的构象比较不改变比较配色。该展示不改写原子属性、源文件或结构；这是原子部分电荷近似，不是 APBS/PB 电势计算，不考虑 pH、盐浓度或溶剂。

已对齐的受体与独立 SDF 姿势属于一个复合物，默认只突出 4 Å 内最近的 5 个接触残基，显示虚线、名称和实际距离；其余原子显示收起，蛋白骨架保持清晰的链配色，不随接触残基数量淡化；口袋高亮保留连续骨架。预览入口按工作台版本加载，界面启动资源不持久缓存，升级后自动使用新的预览样式。可选择 3 个、5 个或全部（最多 60 个），接触文字随视角避让配体和其他标签；空间不足时收起文字，完整距离仍可在明细查看。接触明细默认折叠；可用“显示相互作用”和“残基与距离”关闭。纯配体和真正的构象叠加比较不生成这些接触。该预览层只读取现有坐标，不修改源文件；几何近接不自动判断氢键或疏水作用，化学类型使用原生相互作用分析模块。 当前姿势有原生 GNINA 经验对接分数时，预览旁显示整体评分和方法；没有评分时不补零。该数值不拆分给残基，不转换成力或亲和力；逐残基作用能明确标注“未计算”。

在多受体姿势探索和受体对齐结果里，先从左侧列表选择组合或结构，右侧查看对应的真实三维结果；窄屏优先显示预览。失败或未通过的成员仍可查看原因，原始与对齐文件分别下载。进入性质计算、重新评分或口袋寻找会打开独立问卷，返回结果后保留选择。点击残基会连同周围的真实结构一起定位，避免单个残基占满画面；显示操作不改变源坐标。

每个任务默认新建，材料从上传新文件或填写序列开始。选择 **历史文件** 才会打开已保存材料；不会自动选择旧结果。模块内的 **使用此模板** 按步骤加载真实研发输入，**示例结果** 在当前模块展示已固定的真实输出，不向个人任务记录添加演示任务。用模板提交后是独立的新任务；原始示例计算、文件与来源保留。

Every task starts with fresh uploads or typed inputs. Historical files are opt-in. Use this template provides guided research inputs; Example results stays in the module. Template-derived submissions are new personal tasks, and the original evidence remains available.

**高通量筛选的公开结构库**：v0.4.31 提供 9 家供应商的 16 份已核对结构文件（3,841,777 条原始记录），包括 ChemDiv 2026.09 整库四分卷及砌块；在“分子库管理 → 公开结构库”选择并安装，自动匹配供应商货号字段。混合编码的文字属性使用已审查的 UTF-8 工作版本，原始下载保留。实际化学准备与索引另行运行，35 个目录条目不表示 35 家完整商业库都已取得。范围、获取方式和许可见 [供应商结构文件](design/supplier-structure-files.md)。

主导航按靶点、结构、口袋与对接、小分子、生物药和性质组织科研任务。研究空间统一项目、历史文件与结构编辑；任务与结果统一进度、分析、报告和下载。底部 **设置与帮助** 提供安装与运行、界面设置和使用帮助；界面设置可切换中文/英文及暖色、纯白、夜间黑主题，偏好保存在当前浏览器。

The main navigation groups research by targets, structures, pockets/docking, molecules, biologics and properties. Research workspace combines projects, historical files and editors; Tasks and results combines progress, analysis and downloads. Settings and help contains installation/runtime, appearance/language and help. Browser preferences retain the selected Chinese/English language and theme.

部署状态由 SQLite 保存。暂停会终止该安装步骤的子进程；继续时复用已验证下载和完整 Docker 层，部分步骤可能从头执行。Docker 守护进程可能在客户端暂停后短暂完成当前层。升级仅使用工作台组件目录审核过的版本；更新工作台可以获取新目录。卸载移除独立编辑器/客户端安装文件并停用组件，保留研究结果、模型、下载缓存、原生源码缓存和共享 Docker 镜像。新位置的组件目录由 X-DDE 标记归属；升级复用已有目录与归属标记，不自动搬动环境或研究数据。同一位置同时存在新旧组件目录时拒绝猜测，提示管理员核对。更改安装位置不自动迁移已有数据。

Ubuntu 系统依赖：`sudo $(command -v xdde) setup system` 安装 Docker 与基础工具；Docker 用户访问按 [Docker 官方说明](https://docs.docker.com/engine/install/linux-postinstall/) 配置，GPU 按 [NVIDIA Container Toolkit 官方说明](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) 配置。网页不自动获得管理员权限。Harness 计算服务、共享目录和 LLM 凭据仍在下方环境配置中设置；不会把“已安装”显示成“已能推理”。

**分子与结构**：Ketcher 画分子、打开 MOL/SDF/SMILES、保存到工作台分子库、交接性质计算；Mol* 打开本地蛋白/复合物、查看序列、选择残基、修改显示与导出视图。Mol* 的显示编辑不是蛋白序列设计或结构能量优化。编辑器依赖在本机托管；Mol* 运行在独立的浏览器沙箱中，不能读取工作台会话和上传库。两者保留各自上游许可证，Apache-2.0 仅覆盖本平台自有代码。

改名保留原内部模块与数据目录，已有记录不需要迁移。安装状态和数据默认保存在 `~/.local/share/opendde-workbench`，可用 `WB_HOME` 和 `WB_STATE_DIR` 覆盖。计算组件更改后执行 `xdde restart`；显式 `WB_*` 设置优先于组件管理器。仅监听本机环回地址，服务器远程使用请通过 SSH 隧道。

容器安装网络：默认保留 Docker 的网络配置。若管理员关闭了 Docker 桥接，或代理只监听本机环回地址，在启动平台的环境中设置 `WB_INSTALL_BUILD_NETWORK=host`，并设置现有的 `HTTP_PROXY`、`HTTPS_PROXY` 和 `NO_PROXY`。这只影响受审查的软件安装步骤；科学任务继续使用其离线网络设置。代理凭据不放入命令行参数、案例或仓库。

验证范围：自动 CI 只运行改动模块和直接相关检查；全局科学、浏览器和回归套件保留在手动工作流中，必须明确勾选 `full_suite` 才会执行。安装网络改动对应 `tests/test_install_network.py` 和 `tests/test_deployment.py`，不会触发其他科学模型验收。

模板与 RNA 数据库可在组件管理中安装“模板与 RNA 搜索数据库”。它会先安装固定源码摘要的 Zstandard，然后调用既有 OpenDDE 下载器安装 PDB SEQRES、NT-RNA、Rfam 和 RNAcentral。至少保留 110 GiB 安装空间；数据库保留在组件安装目录的 `models/opendde/search_database`，不写入 Windows 用户目录。数据库完成状态核对原生解压和文件清单，不冒充上游公布了每个 FASTA 的 SHA-256。

对于管理员关闭 Docker 桥接的主机，可以额外设置 `WB_ENGINE_NETWORK=host`。仅用户明确允许网络的 MSA、模板或资源任务使用它并继承已配置的代理；离线预测仍为 `--network none`。压缩工具由组件管理器配置，无需普通用户自行设置命令路径。

## 任务与输入

“全部能力”按设计、结构预测、性质与评分、分析、检索、输入准备、资源配置组织入口。

- **高通量筛选与 DEL：**35 个供应商条目的统一文件接入、可复用六模型分片索引、口袋–分子联合检索/多样性整理/批量对接；DEL 库定义、化学成员、测序解码、UMI 计数、富集与对照、砌块系列、研究模型训练与应用、候选交接和实验回填。14 个模块采用分步问卷，并保留模块内真实模板及已计算结果。科学方法、实际验收与规模边界见[高通量筛选与 DEL](design/screening-and-del.md)。
- **小分子研究：**直接批量计算 SMILES/SDF 的 MW、LogP、TPSA、QED、SA、HBD/HBA 和可旋转键；预测小分子或蛋白–配体结构；查看配体口袋、原生置信度、构象叠加、RMSD 和近邻接触。
- **抗体设计：**使用 Harness 原生 VHH、scFv、VH/VL 设计流程；选择 CDR 和固定位置，审阅目标与计算预算后启动。查看轮次、阶段、候选和结构；调整后续提案数/反思间隔，停止任务，生成表位、相互作用和完整搜索历史分析。
- **序列与候选工具：**ESM2 评分、ESM2 引导提案、SolubleMPNN、候选折叠与评分、ProTrek 序列/结构检索、表位/PLIP 分析、目标对齐后的结合链 RMSD、进化分析、两次候选集比较。
- **完整原生输入：**蛋白、小分子、DNA、RNA、CCD 离子；链 ID/拷贝、残基修饰、单记录三维配体文件、共价连接、已上传 MSA/模板；PDB/CIF 转换、原生 JSON 导入和批量提交。已有结果可直接转为下一步输入。
- **特征与计算控制：**MSA、MSA＋模板、完整蛋白/模板/RNA 特征准备；多种子、TFG、原子置信度、CPU/CUDA、计算内核、缓存/融合/TF32、确定性设置、FoldCP 和服务器登记的自定义 checkpoint。

普通模式提供表单与预设，专业术语带说明；专家模式开放科学参数。抗体序列点选使用从 **1** 开始的编号，提交时转换为 Harness 原生的从 **0** 开始的编号。OpenDDE 共价连接使用其原生的从 **1** 开始的实体/拷贝/位置编号。专家 JSON 遵循所选工具的原生契约。

三维查看器使用绿色配体细棒、清晰的蛋白色带，支持邻域残基、点选、搜索、显示编辑、隐藏/恢复和两点测距。输入原子检查用于拓扑编辑，**不是**预测结合姿势。显示样式编辑不改变坐标；共价编辑器明确生成新的输入连接。

## 连接已有科学环境

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
| `WB_ANARCII_IMAGE` | 管理器安装的固定 ANARCII CPU 镜像 ID；可独立编号抗体，模型来自固定 wheel，无需 OpenDDE。 |
| `WB_ADMET_IMAGE` | 管理器安装的固定 ADMET-AI CPU 镜像 ID；预测 41 个原始性质/早期安全性终点，无需 OpenDDE。 |
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

## 职责与故障恢复

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

## 管理科学计算服务

X-DDE owns the loopback native scientific service lifecycle. The reviewed Harness
factory supplies Docker arguments; it remains one integrated environment among others.
After installing Harness, runtime, compute image and a checkpoint, restart X-DDE.
Startup creates a private `state/compute-service.json` (0600), then starts only the
container tied to that state. Installation & components offers Start/Stop and separate
running/resource-ready states. A stop is refused while platform or native tasks are
active; user assets, other containers and the shared WSL/Docker daemon are preserved.
Stopping explicitly disables automatic service start until the user starts it again.

No LLM provider or API key is required for local scientific tools. Model providers
for conversational campaigns remain a separate account configuration. Explicit
`WB_HARNESS_*` settings can still connect an operator-managed service; X-DDE never
starts or stops it unless it has an owned private service record. Service tokens are
passed over private subprocess input/environment and never returned by public APIs.

WSL native kernel compilation probes the actual CUDA loader in the installed image,
then configures `LIBRARY_PATH` only in the owned service. Host networking is used only
when the saved instance configuration selects it, and listens on 127.0.0.1; X-DDE
never rewrites Docker networking or restarts the shared WSL distribution. Existing
owned containers can be adopted by their exact Docker ID; arbitrary containers
sharing a name or an owner label are not enough. When an installed environment revision changes, the service panel offers Apply
environment update. It retires only the proven idle, owned container, preserves
its storage and private connection, then starts the reviewed new image/code.
Restart X-DDE after component changes to refresh the platform execution settings.

## 结构风险与骨架代表

在 **性质与安全性 → 研究任务 → 分子库与早期筛选** 中，上传新 SDF 分子库，第二步选择“检查结构风险”或“按骨架挑代表”。结构风险使用现有固定版本 RDKit 的 PAINS/Brenk 规则；默认提示后保留候选，暂时排除需明确选择。规则命中不是毒性或无活性结论，未命中不证明安全。

骨架选择使用保留手性的 Murcko 骨架，先覆盖不同结构组，再按每组数量挑选；组内顺序来自输入文件，不代表活性排名。无环分子保留各自完整化学身份，多片段记录原位保留但不参与此项选择，不自动脱盐或枚举状态。专家可调每组上限和规则目录。结果展示规则、骨架组、未选原因与可下载 CSV；选中 SDF 和确切分子记录可继续准备构象、计算性质或对接。历史结果保持原样，未运行的检查不补成阴性结果。

The existing Chemistry environment provides both methods; no additional model or environment is needed. Choose the purpose, then an explicit alert policy or per-scaffold budget and review before submission. Native schema 2 adds actual rule/group evidence and a checked CSV artifact; schema 1 records remain readable and unevaluated. Input molecular identities, stereochemistry, isotopes, charges, coordinates and properties are retained. The methods do not estimate activity, experimental toxicity or affinity.

独立科学环境与实际支持范围：[科学环境升级说明](scientific-upgrade.md)。
