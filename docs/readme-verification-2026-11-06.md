# README verification: 2026-11-06

[中文介绍](../README.md) · [English overview](../README.en.md)

## Revision and scope

- Initial runtime verification: [v0.7.93](https://github.com/Victor-Xu-1/X-DDE/releases/tag/v0.7.93), commit [`ac74b7fc078c146720355360ffd002fefdeef36f`](https://github.com/Victor-Xu-1/X-DDE/commit/ac74b7fc078c146720355360ffd002fefdeef36f). The release tag matched `main` when that initial check was performed. A later source and release check verified [v0.7.96](https://github.com/Victor-Xu-1/X-DDE/releases/tag/v0.7.96) at [`920600cb20977865a14ea920efd71b82119e5a85`](https://github.com/Victor-Xu-1/X-DDE/commit/920600cb20977865a14ea920efd71b82119e5a85).
- The v0.7.93 backend's `frontend_catalogue()` returned **76 entries**. The capability source is unchanged in v0.7.96, so the count remains 76. Both overviews use that count. Entries describe available task interfaces, not installed or scientifically accepted environments.
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

Fresh maintenance-session screenshots of the other core result modules were not completed: the isolated command session's loopback service was not reachable from the separate cloud browser session. The existing result and template images therefore retain their previous v0.4.53 attribution instead of being relabeled as current-version captures. The v0.7.96 input screenshots below are separately obtained CI evidence, not a claim that the blocked browser session was repaired or that the release was redeployed during this follow-up.

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

## 中文摘要

初次核验保留 v0.7.93 的发行包与隔离启动证据，计算计划图现明确标为历史截图。后续核对主线与发行版 v0.7.96，确认能力目录未变化、仍为 76 项，并加入该精确提交真实 CI 保存的材料选择与序列输入图。新图的隔离流程上传并保存过输入材料，但科学任务为零。其余结果页仍保留历史说明，尚未完成逐模块重拍；本次后续核验没有重新部署应用或运行科学计算。
