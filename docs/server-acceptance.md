# Target-server acceptance for X-DDE

This is the acceptance plan for the X-DDE frontend, platform server and scientific adapters. It is not a record of successful inference. Scientific runtime acceptance is deferred to the target server; the local released package and source preview are separately identified during delivery.

## Preparation

1. Check out the exact candidate commit and record `git rev-parse HEAD`. Verify the API title and `health.platform.name` are X-DDE. Record each selected engine’s revision, runtime/image digest, model/resource identifiers and its own acceptance evidence; OpenDDE is not a prerequisite for unrelated engines. Confirm the platform and asset APIs remain available when scientific environments are missing.
2. Use a separate `WB_STATE_DIR` for acceptance. Keep production state and native campaigns intact. Configure `.env.example`; build/install using README commands.
3. Install the audited scientific runtime, CPU/GPU support and required resources. Configure Harness and provider credentials on the server only. For file-based tools, map `WB_HARNESS_SHARED_DIR` to the native compute output root, with `WB_HARNESS_REMOTE_DIR` identifying the same directory inside compute.
4. Run the existing mandatory frontend/backend/packaging gates. Do not skip or weaken them because inference is deferred.

```bash
cd frontend
npm ci
npm run check
npm test
npm run build
cd ..
uv sync --locked --group dev
uv run --locked ruff check src tests server_tests
uv run --locked pytest -q
uv build --wheel
```

The unit/API suite verifies actual SQLite transactions, filesystem boundaries and real controlled processes. Native IPC is isolated where a real model is unavailable. Those tests do not establish RDKit, GPU, service or LLM correctness.

## Real protocol and scientific implementation

Start the candidate workbench, then run this script on the server:

```bash
python server_tests/smoke.py \
  --url http://127.0.0.1:4320 \
  --output /var/tmp/opendde-acceptance/basic.json

# Explicitly adds a small real multi-seed prediction:
python server_tests/smoke.py \
  --url http://127.0.0.1:4320 --gpu \
  --output /var/tmp/opendde-acceptance/gpu.json
```

The basic script invokes native doctor and atom parsing, and checks real RDKit ethanol descriptors. The GPU case requests two seeds × two samples and requires four distinct candidates/artifacts. Tiny fixtures check execution and parsing, not drug efficacy or structural accuracy.

`--cases /path/to/reviewed-cases.json` accepts a list of reviewed Workbench task requests for additional resource/service paths. Upload fixture files first and use their returned IDs. This option can transmit inputs or consume model resources according to those requests; do not populate it with unreviewed third-party tasks. A timed-out test records failure and leaves the task identifiable for inspection/cancellation. Save evidence outside the Git checkout.

## Change → risk → acceptance mapping

| Changed area | Risk and required server evidence | Pass criterion |
| --- | --- | --- |
| Operation union / queue | Legacy task decoding, new utility result types, cancellation, timeout, restart | Existing tests plus actual property/doctor/inspection jobs succeed without a CIF-only assumption; failed manifests stay failed. |
| Atomic batch | Partial insertion, repeated clicks, retries, capacity | Real API batch creates all or none; same key returns the same IDs; conflicting body gives409. |
| Uploads and result reuse | Traversal, symlinks, corruption, wrong type, deletion race | Malformed inputs rejected before execution; snapshots retain SHA-256; referenced files cannot be deleted; completed CIF/A3M can be reused. |
| Native input parity | Residue/copy/atom numbering, modifications, chain IDs, file ligands | Native parser resolves displayed atom IDs; selected bond endpoints reach `covalent_bonds`; multi-record SDF is rejected for one ligand rather than truncated. |
| Feature preparation | Native msa writes outside the initial output root, missing dependencies, accidental networking | Each of msa/mt/prep publishes a reusable inference document; reimported A3M/template paths point to immutable inputs; unavailable databases fail visibly; offline mode does not search. |
| Prediction switches | Dropped or incompatible options | Native CLI accepts CPU/CUDA, TFG, confidence toggle, kernels, cache/fusion/TF32, determinism and configured checkpoints; output/log records the requested mode. |
| FoldCP | Incorrect rank/GPU mapping | At least two real GPUs complete a native distributed prediction and produce native metrics. A single-GPU run is not equivalent evidence. |
| Multi-seed results | Duplicate conformer IDs / overwritten alignments | IDs, aligned filenames and CSV rows are distinct across seeds and samples. |
| Confidence | Invented/incorrect arrays or misleading axes | PAE/PDE/contact map and pLDDT match the actual native JSON; sampling stride and token indices are visible; disabled/missing files display an explanation. |
| Standalone properties | Requiring prediction first, invalid records hidden, CSV formula injection | Known descriptor values match RDKit; per-record parse failures are shown; SDF library counts are preserved up to the documented bound. |
| Harness scientific tools | Native schema drift, wrong file root, missing dependencies, false success | Real ESM, ESM2, MPNN, fold, MSA, ProTrek, epitope, PLIP, RMSD, evolution and comparison fixtures each return their actual contract. External unavailable flags remain unavailable. |
| Campaign configuration | Wrong CDR offsets, permission loss, stale review | VHH, scFv and VH/VL configs validate with native loader; guided1-based selections map once to native0-based positions; expert fields and uploaded YAML survive review. |
| Native launch | Duplicate work after lost response / restart | Reviewed digest matches; double-start cannot create two campaigns; live launcher identity blocks premature reconciliation; no native task after confirmed launcher exit can be re-reviewed safely. |
| Native lifecycle | Competing controller, hidden orphan work, stale UI | Native phase/cycle/candidates/stop/adjust are reflected accurately, persist through reload and use native IDs. Queued core GPU work waits for app-launched campaigns; uncertain launch is visible and recoverable. |
| Native LLM | Credentials, invalid outputs, tools, timeout/retry and cost/token limits | One approved small real campaign reaches candidates; malformed/unavailable provider behavior yields visible native failure; retry and token limits match the configured native policy; no duplicate campaign is launched. Record actual provider/model/usage, not secrets. |
| Candidate analysis | Loss of original history/structure context | Campaign reports use native in-memory history and original task paths; top candidates open real structures; population JSON can be compared through native compare_runs. |
| UI | Dead modules, language, focus, empty/error/loading behavior | Browser journey below passes at desktop and narrow widths; enabled controls use actual reviewed adapters, and unavailable environments remain explicit. |

## Real browser journey

Use the browser on the target installation after the real API checks. Record the exact commit, browser/version, viewport, observed results and screenshots outside Git.

1. Load `/`, switch Chinese/English, refresh and verify language persistence; inspect console/network failures.
2. Find molecular properties, submit a small SMILES library, view its real table and download CSV.
3. Convert an uploaded PDB/CIF, import the resulting input, edit it and submit a real prediction. Refresh the task URL and verify task/result restoration.
4. Open guided/expert modes, modify and restore presets without losing additional scientific controls. Check input validation and keyboard labels.
5. Open native atom inspection, choose both covalent endpoints by preview and by list, remove a bond and inspect the submitted native JSON. A viewer button must not accidentally submit the surrounding form.
6. Inspect ligand pocket, change radius, select residues/atoms, hide/restore, measure distance, compare conformers and inspect native confidence. Verify actual data, not merely canvas presence.
7. Run/reuse prepared features; cancel a queued batch item, retry a failed task and inspect preserved logs/results.
8. Validate a small approved antibody design, review its summary, launch once, refresh the page and restore the campaign. Open a real candidate, generate native reports, export a population and compare two populations.
9. Test loss of backend connectivity, unavailable service, missing model and an interrupted launch. Each must retain inputs and provide a recovery path; no fabricated completed results.
10. At approximately1440px and390px CSS widths, check navigation, forms, tables, focus, tooltip interaction and overflow.

## Evidence and promotion

CI and static checks alone do not satisfy the native matrix. Report each row as passed, failed or not yet run with its actual reason. Missing GPU(s), credentials, model weights or external services are unverified dependencies, not successful tests. Preserve the original failures while fixing them.

Promote the candidate only after relevant mandatory gates and real workflows pass. Install the wheel built from that exact commit. Before rollback, use the pre-upgrade state backup; old0.2 cannot parse the new operation types. Keep native Harness tasks and model stores under their own lifecycle and ownership.

## Acceptance of the planned platform and exploration work

The canonical scope, implementation status and dependencies are the [76-task roadmap](design/README.md#统一实施路线与未完成任务). The rows below are **future required evidence**, not records of completed inference. Run each row only when its actual adapter and relevant inputs are implemented. The existing native matrix and mandatory checks remain in force; each stage has its own reviewed benchmark and pass criteria.

| Roadmap scope | Required implementation and scientific evidence | Guard against a false completion claim |
| --- | --- | --- |
| R01–R09, R25–R29 | Real version/input/constraint checks, SQLite plans/steps/attempts, cancellation/recovery and mapped selections after editing/conversion | No second queue/store; no viewer-index identity, silent hard-constraint relaxation or unsupported stage labeled native |
| R10–R20 | Actual compatible DiffSBDD mode/model matrix, preserved native options, selected input versions, real candidate normalization, 2D/3D continuation and export | Installing models or a successful controlled protocol is not GPU/scientific acceptance |
| R21–R24 | Real descriptors and each enabled predictive endpoint with method, provenance, units, calibration/uncertainty and domain evidence | Descriptors are not full ADMET; uncalibrated docking/LLM output is not measured affinity |
| R30–R40 | Reviewed reference/unknown sites, receptor structures and chemical states, native pose generation, remapping/cluster checks, independent quality and positive/negative cases | Keep multiple hypotheses; distinguish failure, invalidity, unknown and insufficient budget |
| R41–R46 | Exposure and space definitions, target/assembly scope, independently checked constraints, real search-stage support and counterexamples against degenerate solutions | Post-filtering cannot establish guided search; higher exposure alone cannot establish retained binding |
| R47–R56 | Original/full chemical graph, cut/cap/rejoin/stereo checks, both-end evidence, full-molecule conformations and bounded partner assembly sampling | Fragment scores and constructible geometry do not prove ternary cooperativity, degradation or efficacy |
| R57–R64 | Same-condition series/assay data, distinct endpoints/units, versioned iteration and actual parameterization/simulation evidence where enabled | Do not combine incompatible measurements or silently fall back after parameterization failure |
| R65–R69 | Read-only legacy inventory, dry-run, interrupted/repeated import, native candidate/draft/review lineage and actual cross-software result reuse | Keep source data; no pagination truncation, invented origins or competing native campaign authority |
| R70–R76 | Exact-candidate applicable tests, actual browser/API/native workflows, dependency/security review and clean-machine release/install/upgrade/rollback evidence | A new source preview or a wheel build does not update existing release attachments |

Evidence records identify task IDs, exact candidate/native/model versions, inputs, conditions, seeds/budgets, CPU/GPU and service resources, actual commands, outputs, failure/limitations and screenshots where relevant. Keep evidence outside the repository; do not include provider secrets or unnecessary private inputs. New task implementation can progress without local inference; model/GPU/LLM and scientific claims remain unverified until their actual target-server runs complete.

研究计划的软件回归使用真实 SQLite、API 和受控本地进程协议在远程 CI 执行。其科学验收仍需在目标服务器完成：DiffSBDD 输出角色 → 指定候选版本 → 真实 RDKit 性质、跨步骤坐标/固定原子失效拒绝、真实 GPU 取消/恢复及条件性外部工具取消。计划暂停只阻止新步骤派发，已派发任务继续；无法确认同步外部调用终止时明确阻塞。

P2Rank 原生验收使用固定发布包、固定 Java 镜像摘要和官方 1fbl 示例，经过实际 Docker 推理、原生 CSV 解析、共享任务/资产入库。版本、报告及软件意义参考 [P2Rank 官方说明](https://github.com/rdk/p2rank/tree/2.5.1) 和 [稳定发布](https://github.com/rdk/p2rank/releases/tag/2.5.1)。该软件验收不构成未知靶点口袋的实验证实，也不代替 R33–R40 的体系/姿势基准。


## GNINA native docking gate

On an isolated Linux x86_64 server with Docker and at least 12 GiB staging space, after the documented frontend build and locked platform dependency installation:

```bash
uv run --locked --group browser python -m playwright install --with-deps chromium
WB_TEST_NATIVE_DOCKING=1 uv run --locked --group browser pytest -q -s server_tests/test_native_docking.py
```

This downloads the pinned official 2.1 GB executable, builds the hash-locked isolated scientific image and executes actual CPU docking, scoring and local minimization on upstream 184L fixtures. It verifies exact frames, empirical-only scoring, per-pose artifacts, environment fingerprints, original-input/derived-output versions, filtered asset reads restart persistence, actual native cancellation and rendered exact-pose reuse in Chromium. It does not validate docking accuracy, CNN/GPU behavior, experimental potency, special chemistries, full spatial constraints or multi-partner assembly. Run those reviewed target-server benchmarks before asserting scientific suitability. Failure artifacts and native logs remain identifiable under `server_tests/evidence`; CI uploads them, never fabricates successful poses.

Configure the component through Installation & components → GNINA, or set `WB_GNINA_IMAGE` to the immutable reviewed Docker image ID, then restart X-DDE. Readiness requires matching native-version/executable/runtime-lock labels; the actual executable hash is rechecked inside every offline task. No large GNINA installation or scientific execution is authorized on the owner's workstation.

## Independent native property-prediction acceptance

On an isolated Linux x86_64 Docker server, build the packaged frontend and sync the platform's locked development dependencies first. Leave at least 6 GiB for the optional ADMET-AI CPU environment. Install through *Installation & components*; `WB_ADMET_IMAGE` may identify an already installed immutable image. This does not require OpenDDE, a GPU, an LLM service or the upstream Flask application.

```bash
npm ci --prefix frontend
npm run build --prefix frontend
uv sync --locked --group dev
WB_TEST_NATIVE_ADMET=1 WB_AUTO_DEPLOY=0 uv run --locked pytest -q server_tests/test_native_admet.py
```

The mandatory `native-admet` CI job runs this actual installation and offline inference. It compares every endpoint against a direct upstream ADMET-AI 2.0.1 call using the same Chemprop 2.2.2 models, checks exact original single-record and whole-file inputs, invalid and disconnected records, duplicate identities, immutable previews, CSV safety, API validation/CSRF/idempotency, SQLite restart and tamper rejection. The same-run browser job consumes these real outputs, exercises row selection, actual structure loading, exact original-record reuse, one active question, Back, empty inputs, model-unavailable state and desktop/narrow layout. The native fixture remains on CI/target storage; the owner workstation receives only visual PNG evidence and diagnostic logs.

For the browser check on that same isolated server:

```bash
uv sync --locked --group dev --group browser
uv run --locked --group browser python -m playwright install --with-deps chromium
mkdir -p server_tests/evidence/admet
cp -a server_tests/evidence/admet-fixture/. server_tests/evidence/admet/
WB_CORE_FIXTURE=server_tests/evidence WB_AUTO_DEPLOY=0 uv run --locked --group browser pytest -q server_tests/test_admet_browser.py
```

The source SDF, CSV and native diagnostic previews must stay together. CI downloads the exact preceding native job's fixture into that layout automatically.

Prediction values use upstream endpoint units and species. Classification scores refer to original training labels and are not a universal risk percentage. Distribution-volume and half-life endpoints have negative upstream reference R² and carry an explicit caution. Native models do not establish applicability to new chemotypes, individual confidence intervals, dose selection, efficacy or measured safety. No experimental measurements, DrugBank percentiles or uncertainty values are invented. Dataset licenses are not changed by the model's MIT license; no training datasets are downloaded or redistributed by X-DDE.

Public evidence remains a real-service gate. The fixed-source transport permits at most three attempts for transient network failures or HTTP 408/429/500/502/503/504 within a 30-second response budget. Each connection attempt retains a maximum 20-second timeout; the additional time allows bounded recovery after a stalled connection, with backoff and diagnostic attempt logging. It does not retry permission/not-found responses, redirects, invalid content types or malformed data, switch authorities, hide exhausted attempts or substitute cached success. Keep external-service failures and their exact run evidence when diagnosing CI.

The reviewed GNINA executable dynamically links cuDNN 9 even for empirical CPU tasks. Its isolated runtime locks NVIDIA cuDNN 9.8.0.87, cuBLAS 12.8.4.1 and CUDA runtime 12.8.90, cuSPARSE 12.5.8.93, cuFFT 11.3.3.83, cuSOLVER 11.7.3.90 and nvJitLink 12.8.93 by package hashes. These libraries have NVIDIA proprietary software terms, separate from X-DDE Apache-2.0 and GNINA upstream licenses; they are downloaded by the operator's optional environment installation, not vendored into the platform wheel or repository. Installation requires approximately 4.5 GB of downloads and at least 12 GiB free staging space. The image build checks actual native linker dependencies before activation. GPU/CNN performance and scientific accuracy still require separate target-server evidence.


#### 统一条件版本（R27–R29 当前阶段）

在远程 CI 执行 `uv run --locked pytest -q tests/test_constraints.py`、前端 Vitest 全门禁、`server_tests/test_frontend_browser.py` 与既有 native-docking 门禁。使用真正的 SQLite/HTTP/CSRF：同键同文档重放、不同内容冲突、重启与不可变修订、错摘要/版本/坐标系、软权重/装配范围拒绝、固定区域与 native indices 匹配；浏览器保存范围、修改中心、显示不支持、应用旧条件并恢复匹配，检查 390/1440 视口和零科学任务。Native GNINA CI 使用真实 RDKit 解析 fixture 坐标取得中心，保存明确 receptor frame 的范围，运行实际对接并确认结果的 search box 与执行快照相同。

执行快照仅记录条件/参数与输入来源。它不能作为独立结果合格证据；`independent_result_check=not_implemented` 必须保持可见。目标服务器后续必须覆盖固定原子/键的实际保留、输出几何、违反位置、结果资格和空间/装配条件，不得用当前 API/SQLite/原生调用成功替代这些科学验证。本机只静态构建和既有数据的只读预览，不运行上述套件或原生科学任务。


#### 独立输出空间检查与拒绝候选

远程科学 handoff 门禁使用真实 RDKit SDF 解析与构象验证：非氢平均位置和每个重原子、边界、0–0.1 Å 显式容差、二维/NaN 拒绝、硬失败排除和软加权偏差保留。verify 的 `tests/test_constraints.py` 检查结果支持分类、无公共空间、类型/单位/真实违反记录一致性。真实 browser 门禁保存结果条件，验证 `result_check` 未显示为原生搜索约束，修改/应用后恢复并检查390/1440布局。native-docking门禁必须运行真实 GNINA 正例及已有真实姿势的硬空间失败负例：任务计算正常结束，但没有合格候选；保留原始文件、规范化诊断姿势及坐标报告，空合格集合不登记，原始/诊断/空集合的资产交接API必须422。

前端选择与条件版本、软权重和容差必须一致；未经保存的选择不得悄悄省略。此验收仅证明所选几何条件，不证明整体姿势质量或实验结合。固定核心/键/原子碰撞/复杂空间方向/装配范围仍需各自原生与独立科学验收。新增结果条件不可通过恢复旧数据库丢弃；保留研究数据，优先前向修复代码。完整能力路线仍未完成。


PoseBusters quality acceptance runs in the independent CPU environment, not on the owner's workstation:

```bash
WB_TEST_NATIVE_QUALITY=1 WB_AUTO_DEPLOY=0 uv run --locked pytest -q server_tests/test_native_quality.py
```

This gate installs the complete reviewed hash lock, runs real `mol`, `dock` and `redock` profiles through the shared API/Router/Worker/SQLite chain, retains the original selected record even after an invalid preceding SDF record, verifies source versions/restart/CSRF/tamper and checks deliberately distorted geometry. The same run's native report and diagnostic copies feed real Chromium result/3D/form/Back/desktop/narrow acceptance. Nine CI gates are now mandatory. Scientific fixtures and packages stay on CI/target servers; only PNG/log evidence is retrieved on the workstation.

#### Antibody variable-region reference and protected framework proposals

Run on CI or the target server:

```bash
WB_TEST_NATIVE_HUMANIZATION=1 WB_AUTO_DEPLOY=0 uv run --locked pytest -q server_tests/test_native_humanization.py
```

The optional Sapiens component locks Sapiens 1.1.0, ANARCII 2.0.8, Promb 1.0.2, Torch 2.8.0 CPU and their complete dependency hashes. Official VH/VL safetensors and tokenizer revisions/files are verified; the packaged human OAS 9-mer, 10%-subject reference is identified independently. Unused SwissProt/reference proteomes are removed in the package installation layer. Tasks run offline in the platform's existing restricted container and single Router/Worker/Store authority. No BioPhi web/Celery/Redis runtime is deployed.

This gate uses real upstream Sapiens vectors and Promb exact matches as an independent reference, then actual API/CSRF/idempotency, shared queue, source snapshots, IMGT numbering, iterative protected proposals, independent candidate numbering, complete original indices, unsupported/empty cases, immutable sequence versions and SQLite restart/tamper checks. A deliberately unusual framework position is an explicit positive-control fixture; no production model values or returned sequences are manufactured. Candidate/framework and CDR/cysteine rules are verified against the exact original sequence. Only declared changed FASTA candidates are indexed; unchanged numbering intermediates are not exported as new research assets.

The same run's actual native output is used in Chromium to inspect separate reference metrics, original/proposed sequences, exact candidate-to-prediction handoff, saved version reuse, one-question pages, Back persistence, VHH scope reset and final review without premature dispatch. Native installation/readiness controls whether submission is enabled. The fixture goes under `WB_CORE_FIXTURE/humanization`; only PNG/log evidence is retrieved to the owner's workstation. All eleven CI gates remain mandatory for the exact candidate and exact main; native software evidence does not establish clinical immunogenicity, affinity retention, paired-chain compatibility, prospective applicability or complete D07 developability.

Sapiens code and fixed model cards use MIT; ANARCII retains BSD-3-Clause; Promb retains MIT. OAS data and underlying studies retain their own attribution/terms and are not relicensed by X-DDE. See [Sapiens](https://github.com/Merck/Sapiens), [Promb](https://github.com/MSDLLCpapers/promb) and [OAS documentation](https://opig.stats.ox.ac.uk/webapps/oas/documentation). This optional environment does not download training datasets or the full OAS database. Broader biological validation and the remaining roadmap continue separately.


## Early library inspections (scoped remote acceptance)

Use the **Early library inspection checks** workflow for changes to the existing Chemistry library screen. It runs only library contracts, changed form/result consumers, fixed RDKit rules/scaffold regressions, real therapeutic inputs through Chemistry/Router/Worker/API and Chromium with those same outputs. It preserves evidence under `server_tests/evidence/`; it does not run the full validation workflow. The owner PC uses static/build/lifecycle/UI checks.

Verify PAINS/Brenk warnings versus explicit exclusion, scaffold quotas and count budgets, acyclic/multi-fragment handling, exact original record mapping, preserved stereo/isotope/charge/coordinates and legacy schema 1 reads. Downloaded ChEMBL files must match the existing case catalogue digests. The positive rule control is chemical-method validation only. Therapeutic cases do not validate experimental toxicity, safety, potency or affinity.
