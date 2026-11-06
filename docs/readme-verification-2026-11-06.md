# README verification: 2026-11-06

[中文介绍](../README.md) · [English overview](../README.en.md)

## Revision and scope

- Initial runtime verification: [v0.7.93](https://github.com/Victor-Xu-1/X-DDE/releases/tag/v0.7.93), commit [`ac74b7fc078c146720355360ffd002fefdeef36f`](https://github.com/Victor-Xu-1/X-DDE/commit/ac74b7fc078c146720355360ffd002fefdeef36f). The release tag matched `main` when that initial check was performed. A later source and release check verified [v0.7.96](https://github.com/Victor-Xu-1/X-DDE/releases/tag/v0.7.96) at [`920600cb20977865a14ea920efd71b82119e5a85`](https://github.com/Victor-Xu-1/X-DDE/commit/920600cb20977865a14ea920efd71b82119e5a85). A subsequent check verified [v0.7.98](https://github.com/Victor-Xu-1/X-DDE/releases/tag/v0.7.98) at [`456531004b22d0cb3756ddbc7f223ebce0aa99a5`](https://github.com/Victor-Xu-1/X-DDE/commit/456531004b22d0cb3756ddbc7f223ebce0aa99a5), with the exact CI checkout relationship detailed below. The newest source check and pocket-result capture are pinned to [v0.7.99](https://github.com/Victor-Xu-1/X-DDE/releases/tag/v0.7.99), commit [`517d5f9d9a4988b1bd873e9a7e6dca59e3571c62`](https://github.com/Victor-Xu-1/X-DDE/commit/517d5f9d9a4988b1bd873e9a7e6dca59e3571c62).
- The v0.7.93 backend's `frontend_catalogue()` returned **76 entries**. The capability source is unchanged through v0.7.99, so the count remains 76 (directory tree `263a1f711fe2f0bed6e15a648558cd87e511f015`). Both overviews use that count. Entries describe available task interfaces, not installed or scientifically accepted environments.
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

Fresh maintenance-session screenshots of the other core result modules were not completed: the isolated command session's loopback service was not reachable from the separate cloud browser session. The old result and template images retain their previous v0.4.53 attribution instead of being relabeled as current-version captures. A separately obtained v0.7.99 CI image now shows retained BRD4 pocket results. The v0.7.96 input, v0.7.98-source review and v0.7.99 pocket screenshots below are CI evidence, not a claim that the blocked browser session was repaired or that the release was redeployed during this follow-up.

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

## 中文摘要

初次核验保留 v0.7.93 的发行包与隔离启动证据，计算计划图明确标为历史截图；v0.7.96 材料选择和序列输入图保留原版本说明。另保留三张与 v0.7.98 完整源码树一致的真实 PR CI 复核图，已核对实际检出的合并提交，区分序列输入、已有对接姿势和两端独立装配材料。对接文件的重复记录、S/R 条件假设及临时输入写入均明确说明，没有新运行科学任务。最新加入 v0.7.99 精确主线 CI 的 BRD4–JQ1 原生 P2Rank 历史结果图，已与公开案例包逐文件校验；不将其标为尚未取得的 STAT6/9BIG 图片，也没有重新计算。能力目录仍为 76 项。其余结果页保留历史说明，尚未完成逐模块重拍；本次后续核验没有重新部署应用、合并主线或发布安装包。
