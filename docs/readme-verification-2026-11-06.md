# README verification: 2026-11-06

[中文介绍](../README.md) · [English overview](../README.en.md)

## Revision and scope

- Reviewed application: [v0.7.93](https://github.com/Victor-Xu-1/X-DDE/releases/tag/v0.7.93), commit [`ac74b7fc078c146720355360ffd002fefdeef36f`](https://github.com/Victor-Xu-1/X-DDE/commit/ac74b7fc078c146720355360ffd002fefdeef36f). The release tag and the checked `main` revision match.
- The released backend's `frontend_catalogue()` returns **76 entries**. Both overviews now use that count. Entries describe available task interfaces, not installed or scientifically accepted environments.
- This update changes documentation and one image only. It preserves the existing scientific caveats and old image files. The separate draft [PR #71](https://github.com/Victor-Xu-1/X-DDE/pull/71) is not overwritten.

## Current-version screenshot

The README image `images/calculation-plan-v0.7.93.png` is an unchanged copy of `en-1440-light/advanced-plan.png` from the successful [Molecular design scope and review run 42129927921](https://github.com/Victor-Xu-1/X-DDE/actions/runs/42129927921), on the exact application revision above. It was captured by the repository's real compiled-browser check, not redrawn or generated.

- Artifact: [`calculation-plan-evidence`, ID 13462278872](https://github.com/Victor-Xu-1/X-DDE/actions/runs/42129927921/artifacts/13462278872).
- Archive SHA-256: `59e5f574dbc3dbfd0e59c04e98eeb082edac4ab1e824b91adfcb85a31169796c`.
- Published PNG SHA-256: `4c0b7cadf05daefdf11a5274638393dea14a30386d723da9e4f987b7313a2c93`.
- Browser viewport: English, 1440 × 1000, light theme. The original full-page capture is 1440 × 1186.
- The same archive retains English dark-theme and Chinese 390-pixel checks. Their receipts record preserved native requests, keyboard expansion, visible focused seed input, Back/Next preservation, `writes: []` and `scientific_acceptance: false`.
- [Check source at the captured revision](https://github.com/Victor-Xu-1/X-DDE/blob/ac74b7fc078c146720355360ffd002fefdeef36f/server_tests/test_calculation_plan_browser.py) identifies the public STAT6 sequence and supplied ligand input. The shown Boltz-2 environment is unavailable. No prediction, new scientific result or task submission is implied.

The artifact checksum and PNG bytes were verified, and the image was visually inspected. This is retained CI evidence from 2026-11-05, not a fresh screenshot taken during the 2026-11-06 maintenance cycle.

## Isolated release smoke check

The official `x_dde-0.7.93-py3-none-any.whl` was installed into a fresh cloud Python environment. Its SHA-256 matched the release asset: `e4c2e4ed5babe155ee1fed48c14e1bde85b1346710f9200fd32a54c6c977a6c5`.

The reviewed [public case bundle](https://github.com/Victor-Xu-1/X-DDE/releases/tag/examples-v1) was restored into an isolated state directory through the repository's existing restore routine. It reported 45 modules: 44 retained computed examples and one validated configuration example. Restoring these historical results did not rerun them.

With automatic component deployment disabled, the release served its packaged homepage over loopback. `/api/health` reported version `0.7.93`, `platform.ready: true`, `worker_ready: true`; `/api/jobs` returned `[]`. The service was stopped after this smoke check. No owner workstation, production service or scientific environment was upgraded.

## Remaining limits

Fresh screenshots of the other core result modules were not completed: the isolated command session's loopback service was not reachable from the separate cloud browser session. The existing result and template images therefore retain their previous v0.4.53 attribution instead of being relabeled as current-version captures.

This maintenance check does not certify inference, molecular dynamics, FEP, all optional components or scientific validity. No global test suite or new scientific calculation was run. Main-branch integration and an installer publication remain separate steps under the repository's version policy.

## 中文摘要

本轮核对 v0.7.93 的发布标签、提交、发行包摘要及隔离启动状态，将任务入口数量修正为 76，并加入同一提交真实 CI 保存的英文计算计划截图。该图仅展示输入与预算配置，没有提交预测。其余核心结果页尚未完成本轮重拍，继续保留历史版本说明；公开案例恢复、平台启动成功与科学计算验收分别记录，不混为一谈。
