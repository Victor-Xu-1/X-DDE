# README verification: 2026-11-06

[中文介绍](../README.md) · [English overview](../README.en.md)

## Revision and scope

- Initial runtime verification: [v0.7.93](https://github.com/Victor-Xu-1/X-DDE/releases/tag/v0.7.93), commit [`ac74b7fc078c146720355360ffd002fefdeef36f`](https://github.com/Victor-Xu-1/X-DDE/commit/ac74b7fc078c146720355360ffd002fefdeef36f). The release tag matched `main` when that initial check was performed. A later source and release check verified [v0.7.96](https://github.com/Victor-Xu-1/X-DDE/releases/tag/v0.7.96) at [`920600cb20977865a14ea920efd71b82119e5a85`](https://github.com/Victor-Xu-1/X-DDE/commit/920600cb20977865a14ea920efd71b82119e5a85). A subsequent check verified [v0.7.98](https://github.com/Victor-Xu-1/X-DDE/releases/tag/v0.7.98) at [`456531004b22d0cb3756ddbc7f223ebce0aa99a5`](https://github.com/Victor-Xu-1/X-DDE/commit/456531004b22d0cb3756ddbc7f223ebce0aa99a5), with the exact CI checkout relationship detailed below. The subsequent pocket-result capture is pinned to [v0.7.99](https://github.com/Victor-Xu-1/X-DDE/releases/tag/v0.7.99), commit [`517d5f9d9a4988b1bd873e9a7e6dca59e3571c62`](https://github.com/Victor-Xu-1/X-DDE/commit/517d5f9d9a4988b1bd873e9a7e6dca59e3571c62).
- The 10:03 UTC maintenance cycle verified [v0.7.100](https://github.com/Victor-Xu-1/X-DDE/releases/tag/v0.7.100), exact main/tag commit [`27d62f162755cfa2dd1cfc8816493a580d6744fb`](https://github.com/Victor-Xu-1/X-DDE/commit/27d62f162755cfa2dd1cfc8816493a580d6744fb), and performed the isolated wheel smoke check below.
- The 20:03 UTC cycle verified [v0.8.1](https://github.com/Victor-Xu-1/X-DDE/releases/tag/v0.8.1), exact main/tag commit `80c7633fe79dad0909a282a4128cc3fb6e06ddaa`, with a fresh isolated wheel check and two independently retrieved current-version historical-input screenshots, detailed below.
- The v0.7.93 backend's `frontend_catalogue()` returned **76 entries**. The capability source is unchanged through v0.8.1, so the count remains 76 (directory tree `263a1f711fe2f0bed6e15a648558cd87e511f015`). Both overviews use that count. Entries describe available task interfaces, not installed or scientifically accepted environments.
- This update changes documentation and screenshot assets only. It preserves the existing scientific caveats and old image files. The separate draft [PR #71](https://github.com/Victor-Xu-1/X-DDE/pull/71) is not overwritten.

## Retained v0.7.93 calculation-plan screenshot

The README image `images/calculation-plan-v0.7.93.png` is an unchanged copy of `en-1440-light/advanced-plan.png` from the successful [Molecular design scope and review run 42129927921](https://github.com/Victor-Xu-1/X-DDE/actions/runs/42129927921), on the initial v0.7.93 application revision above. It was captured by the repository's real compiled-browser check, not redrawn or generated.

- Artifact: [`calculation-plan-evidence`, ID 13462278872](https://github.com/Victor-Xu-1/X-DDE/actions/runs/42129927921/artifacts/13462278872).
- Archive SHA-256: `59e5f574dbc3dbfd0e59c04e98eeb082edac4ab1e824b91adfcb85a31169796c`.
- Published PNG SHA-256: `4c0b7cadf05daefdf11a5274638393dea14a30386d723da9e4f987b7313a2c93`.
- Browser viewport: English, 1440 × 1000, light theme. The original full-page capture is 1440 × 1186.
- The same archive retains English dark-theme and Chinese 390-pixel checks. Their receipts record preserved native requests, keyboard expansion, visible focused seed input, Back/Next preservation, `writes: []` and `scientific_acceptance: false`.
- [Check source at the captured revision](https://github.com/Victor-Xu-1/X-DDE/blob/ac74b7fc078c146720355360ffd002fefdeef36f/server_tests/test_calculation_plan_browser.py) identifies the public STAT6 sequence and supplied ligand input. The shown Boltz-2 environment is unavailable. No prediction, new scientific result or task submission is implied.

The artifact checksum and PNG bytes were verified, and the image was visually inspected. This is retained CI evidence from 2026-11-05, not a fresh screenshot taken during the 2026-11-06 maintenance cycle.

## Isolated v0.7.93 release smoke check

The official `x_dde-0.7.93-py3-none-any.whl` was installed into a fresh cloud Python environment. Its SHA-256 matched the release asset: `e4c2e4ed5babe155ee1fed48c14e1bde85b1346710f9200fd32a54c6c977a6c5`.

The reviewed [public case bundle](https://github.com/Victor-Xu-1/X-DDE/releases/tag/examples-v1) was restored into an isolated state directory through the repository's existing restore routine. It reported 45 modules: 44 retained computed examples and one validated configuration example. Restoring these historical results did not rerun them.

With automatic component deployment disabled, the release served its packaged homepage over loopback. `/api/health` reported version `0.7.93`, `platform.ready: true`, `worker_ready: true`; `/api/jobs` returned `[]`. The service was stopped after this smoke check. No owner workstation, production service or scientific environment was upgraded.

## Remaining limits

Fresh maintenance-session screenshots of the other core result modules were not completed: the isolated command session's loopback service was not reachable from the separate cloud browser session. The old result and template images retain their previous v0.4.53 attribution instead of being relabeled as current-version captures. A separately obtained v0.7.99 CI image now shows retained BRD4 pocket results. The v0.7.96 input, v0.7.98-source review, v0.7.99 pocket and v0.7.100 prediction screenshots below are separately obtained CI evidence. The v0.7.100 wheel was newly installed and smoke-tested in an isolated loopback environment during the 10:03 UTC cycle, but no screenshot is attributed to that service and the separate-browser reachability limit is not claimed to be resolved.

This maintenance check does not certify inference, molecular dynamics, FEP, all optional components or scientific validity. No global test suite or new scientific calculation was run. Main-branch integration and an installer publication remain separate steps under the repository's version policy.

## v0.7.96 input-page screenshots

Two unchanged PNGs were obtained from successful [Exact research input selection and recovery run 42146976887](https://github.com/Victor-Xu-1/X-DDE/actions/runs/42146976887), whose head is exactly `920600cb20977865a14ea920efd71b82119e5a85`, matching the v0.7.96 release tag.

- Artifact: [`compact-material-input-evidence`, ID 13469649790](https://github.com/Victor-Xu-1/X-DDE/actions/runs/42146976887/artifacts/13469649790).
- Archive SHA-256: `ad6de5ba69c92ce041bb8a34e1f212972d012542ee31dd9e077da06bed926f57`.
- `images/material-inputs-v0.7.96.png` copies `en/docking-materials.png`, 1280 × 1091. SHA-256: `a6ff382985a0da706b784c991af60d82c60cef0356162ab6d053f901158bf900`.
- `images/sequence-input-v0.7.96.png` copies `sequence-en/sequence-paste.png`, 1280 × 900. SHA-256: `15820c3fb62ffcd5f689474c8ff0fb9d630c59680789689923caa61012a5f411`.
- Both original browser viewports are English, 1280 × 900, Warm theme. Their archive checksums, individual image bytes, dimensions and visible content were checked without image editing.

The [material-input check](https://github.com/Victor-Xu-1/X-DDE/blob/920600cb20977865a14ea920efd71b82119e5a85/server_tests/test_material_sources_browser.py) loads verified STAT6 study inputs. Its two-record SDF repeats the same source record to test restoration of record 2; it is not a two-candidate dataset or docking result. The receipt records unchanged source hashes, ignored abandoned-upload responses and zero scientific jobs.

The [sequence-input check](https://github.com/Victor-Xu-1/X-DDE/blob/920600cb20977865a14ea920efd71b82119e5a85/server_tests/test_sequence_material_browser.py) uses the public 6WGL variable-domain input. The published image is captured before confirmation, with Next disabled. Later steps in the same isolated test upload and save input assets, verify source-specific draft restoration and idempotent retry, and retain zero scientific jobs. These checks have real writes to temporary input storage; unlike the older calculation-plan check, they do not claim `writes: []`.

The scientific backends shown in both screenshots are unavailable. No newly designed antibody, docking pose, inferred activity or completed scientific computation is depicted. The 6WGL input does not establish a new STAT6-binding result.

## v0.7.98-source task-review screenshots

Three unchanged PNGs were obtained from successful [Prediction workspace presentation checks run 42168045701](https://github.com/Victor-Xu-1/X-DDE/actions/runs/42168045701). This is a PR run, not a run on the release commit itself:

- Run head: [`0ef9bb7b6425cec3c4d2697681ccc7c516f78315`](https://github.com/Victor-Xu-1/X-DDE/commit/0ef9bb7b6425cec3c4d2697681ccc7c516f78315).
- Actual checkout, confirmed in [interface job 127729081330](https://github.com/Victor-Xu-1/X-DDE/actions/runs/42168045701/job/127729081330) logs: PR merge ref [`ec8fc84111a875d137fc1aecb2da0ae43a4dcdda`](https://github.com/Victor-Xu-1/X-DDE/commit/ec8fc84111a875d137fc1aecb2da0ae43a4dcdda).
- Release tag v0.7.98 and checked `main`: `456531004b22d0cb3756ddbc7f223ebce0aa99a5`.
- All three commits have the same complete Git tree: `1c841a56ee767e8396981e279122e446a16c79fa`. This supports attribution to the v0.7.98 source tree, without claiming identical commit IDs or a new maintenance-session deployment.
- Artifact: [`prediction-workspace-evidence`, ID 13480301812](https://github.com/Victor-Xu-1/X-DDE/actions/runs/42168045701/artifacts/13480301812), 5,707,454 bytes.
- Archive SHA-256: `0ab6da65f1c986e0b45c1c658536a235ebe79ed1b7ad36c25e70b5366df332ee`, matching both GitHub metadata and the upload log.

Selected English screenshots, copied byte for byte and visually inspected:

| Published image | Original archive path | Pixels | SHA-256 |
| --- | --- | --- | --- |
| `images/job-review-v0.7.98.png` | `outputs/job-review-layout/en/sequence-overview.png` | 1280 × 720 | `653466baaa708fcbb95d0bfc525fb2f45f26df43bbc035978d63672bf5c4bd16` |
| `images/docking-review-v0.7.98.png` | `outputs/docking-job-review/en/overview.png` | 1440 × 1000 | `3db873057ad166b666d777158704648e095fb3edd80e13a4509f9f352c4ad7d9` |
| `images/ternary-review-v0.7.98.png` | `outputs/ternary-job-review/en/partner-a.png` | 1440 × 1000 | `9a58d7b1cf1159a91f0f4dc4704a80ce8430b3ebb4107ed517cf55ff457409a9` |

### What these pictures establish

- **Prediction input review:** the [shared review test](https://github.com/Victor-Xu-1/X-DDE/blob/456531004b22d0cb3756ddbc7f223ebce0aa99a5/server_tests/test_job_review_layout_browser.py) enters the repository's public STAT6 P42226 sequence (847 residues) and supplied small-molecule SMILES. The image shows Mol-1base, 5 requested structures, seed 101, no MSA and no network access. These are unsubmitted settings. The receipt records the exact sequence, retained expanded entity, no page errors and `api_writes: []`; the test also verifies an empty job list and disabled submission. Ketcher drawing later in the same test depicts the actual input, not a predicted structure.
- **Docking input review:** the [docking review test](https://github.com/Victor-Xu-1/X-DDE/blob/456531004b22d0cb3756ddbc7f223ebce0aa99a5/server_tests/test_docking_job_review_browser.py) saves the observed 9BIG STAT6 receptor, retained native search poses and deposited AK1690 reference into temporary storage. Record 2 remains the exact selected pose, but the source pose file is repeated to exceed 500 records for selection testing; these repeats do not represent additional unique candidates. The shown box uses deposited AK1690 heavy-atom bounds with 4 Å padding per side. A preceding test intentionally corrupts a response to verify rejection; that interception is removed and the original file reverified before this screenshot. The captured review uses original data, GNINA is unavailable, API writes are empty during browser review, and the job list stays empty. The accompanying `acceptance.json` is the checked request payload, not a completed docking result.
- **Ternary input review:** the [ternary review test](https://github.com/Victor-Xu-1/X-DDE/blob/456531004b22d0cb3756ddbc7f223ebce0aa99a5/server_tests/test_ternary_job_review_browser.py) saves real inputs in temporary storage and reviews two independent binary coordinate frames. Its [fixture provenance](https://github.com/Victor-Xu-1/X-DDE/blob/456531004b22d0cb3756ddbc7f223ebce0aa99a5/server_tests/fixtures/stat6-ternary-memory/provenance.json) identifies the engineered CRBN-midi 8RQA construct, observed 9BIG STAT6 chain A/alt A, and retained native GNINA arm-pose hypotheses. The arm poses are not experimental poses. S and R inputs are conditional hypotheses for an originally unassigned center; record 2 selects R without assigning the original compound's stereochemistry. Source hashes, selected records and atom mappings are checked, submission is disabled, no API write occurs during review, and the job list remains empty. There is no newly computed ternary assembly or evidence of degradation activity.

The complete artifact contains additional tests with different contracts, including saved input assets and controlled readiness/rejected submission checks. The no-write statements above apply to their specified review flows, not the whole archive. No screenshot with synthesized prediction confidence or ranking metrics was selected. The selected captures establish input presentation, source identity and review behavior; they do not establish new scientific acceptance, binding affinity or a validated therapeutic effect. Geometric contacts in the ternary view remain distances, not interaction energies.

The successful source CI covers the checked application tree. Documentation-only branch changes have separate local verification and are not claimed to have inherited a new CI run. This update does not merge application changes into the documentation branch or publish a release.

## v0.7.99 retained BRD4 pocket-result screenshot

The [owner's #213 delivery report](https://github.com/Victor-Xu-1/X-DDE/pull/213#issuecomment-6678643235) describes local STAT6 Boltz-2 and 9BIG pocket captures, but provides no downloadable images. Those local pictures and deployment were not independently inspected or used here. The available public CI evidence instead contains a **BRD4–JQ1 P2Rank pocket result**; its identity is kept distinct.

- Source: successful [Modular task history and result navigation run 42173334885](https://github.com/Victor-Xu-1/X-DDE/actions/runs/42173334885), triggered by a push to `main` at `517d5f9d9a4988b1bd873e9a7e6dca59e3571c62`, exactly matching the v0.7.99 tag. [Job 127746002977](https://github.com/Victor-Xu-1/X-DDE/actions/runs/42173334885/job/127746002977) logs confirm this actual checkout. The tree is `7252cc2193924317617c091ffab3bcbb128e2c9c`.
- Artifact: [`task-history-native-evidence`, ID 13481489065](https://github.com/Victor-Xu-1/X-DDE/actions/runs/42173334885/artifacts/13481489065), 19,394,094 bytes; archive SHA-256 `740909ade278a1a3b4f3c3181617723cef3210228c47388b6bd6b32cc60700a0`, matching GitHub metadata and the upload log.
- `images/pocket-result-v0.7.99.png` is an unchanged copy of `en/verified-case-title.png`, 1440 × 1000 pixels, 234,357 bytes; SHA-256 `496aa5974152a4404c858f0d66fd0014cc67d41e68904e6647737601bf202479`. The image was visually inspected. It is the original viewport capture, not a full-page view or an edited composite.
- Public data source: [`examples-v1`](https://github.com/Victor-Xu-1/X-DDE/releases/tag/examples-v1), `x-dde-public-cases-v1.zip`; SHA-256 `e0df54c105e695480ab568048ac131f732ca1d02c1286a0574b69be16e975f29`. This existing public archive was independently checked against the result evidence. No private workstation data was uploaded.

The [restore step](https://github.com/Victor-Xu-1/X-DDE/blob/517d5f9d9a4988b1bd873e9a7e6dca59e3571c62/server_tests/prepare_layout_cases.py) verifies the public bundle. The [history preparation](https://github.com/Victor-Xu-1/X-DDE/blob/517d5f9d9a4988b1bd873e9a7e6dca59e3571c62/server_tests/prepare_task_history.py) verifies the `p2rank.detect` pin and clones its existing files for navigation checks. It also creates 125 cancelled metadata-only task records in isolated CI storage, without executing them. Thus this preparation is not a zero-write operation, and its history list is not a collection of 125 real scientific runs.

The [browser check](https://github.com/Victor-Xu-1/X-DDE/blob/517d5f9d9a4988b1bd873e9a7e6dca59e3571c62/server_tests/test_task_history_browser.py) finally opens the **original verified example**, source job `ae24dc7a-6cea-4808-8e96-7cdd752be5ac`, and captures the selected `verified-case-title.png`. The controlled history records are not displayed in this image. The original task title and case identity are preserved. No screenshot from the separate stubbed project-response test was selected.

All five retained scientific files in the CI fixture were checked against the public bundle: native predictions CSV, native residue CSV, native parameters, `protein.pdb` and `result.json`. In particular:

- Native predictions CSV SHA-256: `fba9bba65001c449f161b97c322d07983aefac936a4147d5ac1c6026cfd53a58`.
- `protein.pdb` SHA-256: `1f59bf725f67beff28cce2352e8a56350948e1c85b55091df05b3d48fd7930c6`.
- `result.json` SHA-256: `c814eda792a39517f5a6e87e3096861086645937cb237c985a3c8d266d023409`.

The visible first-pocket probability 0.732, site score 14.72 and 17 residues agree with the retained native output. They are model outputs, not measured affinity or experimental binding probabilities. The receipt records unchanged native artifacts, zero submitted jobs and `scientific_inference: false`. Existing results were restored and displayed; pocket detection was not rerun, and this image is not a STAT6 or Boltz-2 result. Source CI passed 139 frontend, 48 backend and four browser checks; these are existing application-run results, not tests newly executed by this README update.

## 10:03 UTC cycle: v0.7.100 isolated release and retained prediction results

### Release smoke check

The official v0.7.100 wheel was installed in a fresh, isolated cloud Python environment with separate application state and cache. Its SHA-256 is `52d9592149edf81c7c5dce0e2bae1d206efbecbbd821024ed704bff565c0b485`, matching the release asset. Automatic component deployment remained disabled (`WB_AUTO_DEPLOY=0`). No model or scientific engine was installed.

The public [`examples-v2/stat6-reviewed-results-v35.zip`](https://github.com/Victor-Xu-1/X-DDE/releases/download/examples-v2/stat6-reviewed-results-v35.zip) was downloaded and verified: 22,979,842 bytes, SHA-256 `62e8d64dd4be5dca420f7f1ef659aae932345128c9306697d3d2cea9a99a9f48`. The application's existing restore routine reported 58 computed module examples. It restored 115 retained task records (111 succeeded, four failed), with no queued or running job. The failed records are historical, not failures caused by this smoke check.

The wheel served its packaged homepage, health and job API over isolated loopback port 4394. All three returned HTTP 200; health reported version `0.7.100`, `platform.ready: true` and `worker_ready: true`. The installed wheel's confidence reader verified the retained OpenDDE result's 116 tokens, 943 atom pLDDT values and exact structure/confidence hashes. Its capability catalogue still returned 76 entries.

After stopping the owned service, all 115 task records and all 1,098 archived job/asset files remained unchanged. The shutdown log confirms application shutdown completed; the process exited following the requested SIGTERM (return code −15). No scientific calculation was submitted or executed. This is an isolated release smoke check, not a production or owner-workstation deployment, browser acceptance of that loopback instance, or a claim that optional scientific engines are available. A compact [cycle receipt](readme-cycle-2026-11-06-1003.json) records these checks.

### Screenshot source and selected originals

The chosen screenshots come from successful [Prediction workspace run 42194357650](https://github.com/Victor-Xu-1/X-DDE/actions/runs/42194357650), a push run on the exact release commit. The [interface job 127813849847](https://github.com/Victor-Xu-1/X-DDE/actions/runs/42194357650/job/127813849847) checkout log confirms `27d62f162755cfa2dd1cfc8816493a580d6744fb`, tree `ddc4517c896837c091eb23f4e930f6c5fdb71c55`.

- Artifact: [`prediction-workspace-evidence`, ID 13491527177](https://github.com/Victor-Xu-1/X-DDE/actions/runs/42194357650/artifacts/13491527177), 5,111,033 bytes; SHA-256 `c453f83e4682be73671936081c9ea25b8247fc93f4a7466c21ba75caa57de78b`, matching GitHub metadata and the upload log.
- `images/stat6-opendde-confidence-v0.7.100.png` copies `outputs/native-confidence/en-1440/atom-confidence.png`, 1440 × 1000, 241,906 bytes; SHA-256 `978ec37e88b915b7e2bca21ccc6f63af66ba41321cd19cc8d211ae2a1c8e9123`.
- `images/stat6-boltz-result-v0.7.100.png` copies `outputs/prediction-job-archive/en/boltz.predict.png`, 1440 × 960, 212,718 bytes; SHA-256 `e0a3ffb3b4fcacd061264662443b4490eaafed76522050a0fa6e3cde33e998ec`.
- Both images were visually inspected and copied without changing any pixels. They are viewport captures, with content beyond the viewport not shown, not full-page screenshots. The OpenDDE capture is scrolled below its task title; its identity is established from the original archive, receipt and test source.

### Scientific identity and limits

**OpenDDE:** [native_confidence_case.py](https://github.com/Victor-Xu-1/X-DDE/blob/27d62f162755cfa2dd1cfc8816493a580d6744fb/server_tests/native_confidence_case.py) restores the actual `predict` pin from public v35 task `716024e7-0a4a-4b9f-8962-fae4257bba48`. Its original request is the MSA-supported STAT6 SH2 517–632 construct, not a full-length receptor or a Boltz-2 run. The selected `seed-101-sample-0` has 116 tokens and 943 atom-confidence values. The complete native confidence file is byte-identical to the public archive, SHA-256 `bc1aec74789de9786f048eeb3f63f56fc0aa673d8ae43c42d2fa09b4d96d0e17`; its structure SHA-256 is `affc4ef88404951e0906c08674e1bac7bb2a8c2ca0b2530b8998ed82906d73f6`. The [browser test](https://github.com/Victor-Xu-1/X-DDE/blob/27d62f162755cfa2dd1cfc8816493a580d6744fb/server_tests/test_native_confidence_browser.py) checks linked sequence/matrix selection, actual Plotly geometry, 0–1 to 0–100 atom pLDDT display, and unchanged original download bytes. This retained model confidence does not establish binding or experimental accuracy.

**Boltz-2:** the [job-archive browser test](https://github.com/Victor-Xu-1/X-DDE/blob/27d62f162755cfa2dd1cfc8816493a580d6744fb/server_tests/test_prediction_job_archive_browser.py) uses the full public-v35 restore fixture and its verified `boltz.predict` pin, task `1190e938-51af-44a3-9dbc-4aacc77b5821`. The original result identifies Boltz 2.2.1, the STAT6 SH2 construct plus supplied 30-heavy-atom warhead, native MSA and three retained structures. The shown `structure-001` has native confidence score `0.8709172606468201`, displayed as 0.87. Its structure SHA-256 is `ba688f7826d16fbf69490efa6f71ccc114dac92f032027a2cfd392a640fe1a53`; its native confidence-summary SHA-256 is `89c8b79debcf861710f65b7a32b3a769463dfd6908a0b1fe065fcd7180fff22b`. The selected image precedes the test's temporary download-failure interception.

The Boltz screenshot intentionally retains the **missing PAE matrix** notice for this archived conformer and the **clash with omitted receptor domains** warning from its 9BIG comparison. No missing matrix is fabricated from scalar confidence. The archived scientific review cautions against treating higher-ranked samples 001/002 as preferred binding solutions; even the separately reviewed sample003 remains a regional hypothesis. 9BIG's chemically different ligand supplies receptor context, not ground truth for the supplied molecule. This is not affinity validation or evidence of successful full-receptor binding.

The reviewed #214 branch artifact 13491060169 also contains `outputs/boltz-confidence/*`, as does the exact-main artifact. That group is generated by the explicitly synthetic [format-contract fixture](https://github.com/Victor-Xu-1/X-DDE/blob/27d62f162755cfa2dd1cfc8816493a580d6744fb/server_tests/boltz_confidence_case.py), including invented small arrays and coordinates; **none of those images is used here**. The real `prediction-job-archive` Boltz capture and `native-confidence` OpenDDE capture have different, public archived sources. Restoring these sources writes isolated state; the selected browser flows then make no API writes or scientific runs. No private desktop material was uploaded.

## 10:03 UTC 中文摘要

各历史图片保留原版本：v0.7.93 计算计划、v0.7.96 输入、v0.7.98 任务复核和 v0.7.99 BRD4 口袋结果。本轮核实 v0.7.100 精确主线与官方包，完成独立回环启动和关闭，115 条历史任务及 1,098 个科学文件均未变化，能力目录仍为 76 项。

新增两张精确主线 CI 的公开 STAT6 历史结果图：OpenDDE 的真实置信度与 Boltz-2 的原生姿势。明确区分模型身份，保留 PAE 缺失和受体域碰撞警告，排除合成格式测试图片。截图不是本轮回环服务重新拍摄，也没有新运行科学计算。其余核心模块尚未全部重拍；主线合并、生产部署和发布安装包均未执行。

## 20:03 UTC cycle: v0.8.1 isolated release and historical-input views

### Exact release and bounded runtime check

At this cycle, `main` and the [v0.8.1 tag](https://github.com/Victor-Xu-1/X-DDE/releases/tag/v0.8.1) both resolved to `80c7633fe79dad0909a282a4128cc3fb6e06ddaa`, tree `e58d226e0de8aade9903e5ddcd023dbdcf57154b`. The existing README branch started at `51e20fef4b5a36980b16b0e9fe1c5f29ec193e87`; no concurrent change was overwritten. The separate draft PR #71 and open feature PR #220 were left untouched. No feature-branch UI was represented as a released feature.

The official `x_dde-0.8.1-py3-none-any.whl` was downloaded and installed in a fresh, isolated cloud environment. Its SHA-256 `5c6db303ebb584b62cfe20a945fac505de03ab72c3243fcf1d7d9f2e8977d66e` matches release metadata. The same verified public v35 archive described above was restored through the installed wheel. Automatic component deployment remained disabled; no scientific engine or model was installed.

The owned service ran only on isolated loopback port 4395 and was stopped after the check. `/api/health`, `/` and `/api/jobs` returned HTTP 200; health identified version `0.8.1`, platform readiness and worker readiness. The installed capability catalogue returned **76** entries, with its source directory tree unchanged. The restore reported 58 computed module examples and 115 historical task records (111 succeeded, four failed). All 115 records and all 1,098 archived job/asset files were verified unchanged after service shutdown. The four failed records were retained history, not new smoke-check failures. The OpenDDE confidence reader still returned 116 tokens, 943 atom values and the previously recorded native hashes. Shutdown completed normally following SIGTERM (process return code −15).

The [20:03 cycle receipt](readme-cycle-2026-11-06-2003.json) records this runtime check. No new scientific computation, production change, owner-workstation change, main merge or release publication occurred. This is not browser acceptance of the maintenance loopback instance or proof that optional GPU engines are available. The separate cloud-browser reachability limitation remains; the screenshots below are independently retrieved exact-main CI captures, not pictures newly taken from this service.

### Genuine current-version CI images

Successful [Prediction workspace run 42217220898](https://github.com/Victor-Xu-1/X-DDE/actions/runs/42217220898) used the exact v0.8.1 commit. The [interface job 127890189015](https://github.com/Victor-Xu-1/X-DDE/actions/runs/42217220898/job/127890189015) checkout log confirms `80c7633fe79dad0909a282a4128cc3fb6e06ddaa`.

- Artifact: [`prediction-workspace-evidence`, ID 13502196537](https://github.com/Victor-Xu-1/X-DDE/actions/runs/42217220898/artifacts/13502196537), 2,450,351 bytes; SHA-256 `3770a02cc1a88cc603c3684ee362c0c8d58ff538d97a075d8968330c57b32292`, checked against GitHub metadata, upload logs and downloaded bytes.
- `images/stat6-boltz-input-v0.8.1.png` copies `outputs/prediction-history-input/en/view-input.png`, 1440 × 960, 133,422 bytes; SHA-256 `2c1bb6aad501e1fb811bd7b137e9ddffda9d8fb5d6cae46c20b0b51d151381ae`.
- `images/stat6-opendde-input-v0.8.1.png` copies `outputs/prediction-history-input/en/view-native-input.png`, 1440 × 960, 166,095 bytes; SHA-256 `8b65c3d967efe326b2934bcc39d10eb50b5192c87cd055897e410c60b3981687`.

Both images were visually inspected and copied byte for byte. They are original viewport captures, not full-page captures or generated illustrations. The Boltz image is scrolled to the ligand, not a complete input overview. The artifact's earlier `view-overview.png` still shows loading placeholders and was not selected. Existing v0.7.100 result captures retain their original labels and bytes.

### Recorded submission versus reconstructed saved document

The [historical-input browser check](https://github.com/Victor-Xu-1/X-DDE/blob/80c7633fe79dad0909a282a4128cc3fb6e06ddaa/server_tests/test_prediction_history_input_browser.py) restores the public v35 bundle and verifies its `boltz.predict` and `predict` pins. These images do not use synthetic scientific results.

**Boltz-2:** task `1190e938-51af-44a3-9dbc-4aacc77b5821` displays its original database-recorded request. The exact request SHA-256 `152eb73c4c1e4313e2d2040d030c423b23ecb54ceba24e45c947fbe9c1aac4aa` independently matches the restored database and CI receipt. It contains the 116-residue STAT6 SH2 517–632 sequence with provided MSA and the chain-B ligand. Its first SDF record (zero-based record 0) comes from public asset `5c4252d0-453b-45b7-bf3a-d9c9fe627bb5`, SHA-256 `d1d34633711dec2c0da53add660dd47d766f25c807df5ad73465908686713e32`; the archive's original SDF bytes were independently checked. The native Ketcher drawing is loaded in the selected screenshot. Seed 101 and CUDA are historical requested settings, not a claim of present GPU readiness or a new run.

**OpenDDE:** task `716024e7-0a4a-4b9f-8962-fae4257bba48` displays a saved `input.json` for the 116-residue STAT6 SH2 construct, chain A, one copy, seed 101 and its unpaired MSA. Crucially, the public archive does **not** contain the original runtime `input.json`. The [restore routine](https://github.com/Victor-Xu-1/X-DDE/blob/80c7633fe79dad0909a282a4128cc3fb6e06ddaa/src/opendde_workbench/examples/bundle_restore.py#L173-L181) reconstructs and writes it from the archived request and restored asset bindings. The [API](https://github.com/Victor-Xu-1/X-DDE/blob/80c7633fe79dad0909a282a4128cc3fb6e06ddaa/src/opendde_workbench/api.py#L554-L568) labels an existing file `stored-document`; that label does not establish original-runtime-file provenance. The rebuilt document's SHA-256 `0e35043e06e81870a60851998a8888bc56e223640ad1f3462f6ef58aa6a2b28d` independently matches this cycle's restored file and CI receipt. Do not describe it as a byte-preserved original submission or infer absent parameters from defaults.

The browser test deliberately fails one initial input read, then retries successfully before taking the selected images. It checks the Boltz request/download bytes and ligand identity, the separate OpenDDE document and source label, and unchanged task records. Its acceptance receipt reports no research API writes and no page errors. Restore preparation writes isolated state; it is not a globally zero-write operation. These are input-provenance views, not new predictions, binding validation or evidence that the archived result's scientific limitations were resolved. No private desktop data was used.

### 本轮摘要

v0.8.1 官方包在隔离环境完成启动、读取和关闭，76 项目录、115 条历史任务及 1,098 个归档科学文件均已核对。新增两张当前主线 CI 原图，分别说明 Boltz-2 原始提交请求与 OpenDDE 恢复时重建的已保存文档，未把重建文件说成原始运行文件。既有结果图保留实际旧版本；其余核心结果模块仍未全部重拍。本轮没有新科学计算，也未更改生产、桌面或主线。
