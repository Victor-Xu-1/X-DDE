# Runtime repairs and scientific asset identity

An operating-system library repair must not silently change a scientific model,
discard verified weights or force regeneration of an unchanged screening library.
Runtime installation and scientific asset reuse have separate verification duties.

| Boundary | Identity and verification |
| --- | --- |
| Runtime image | The complete current recipe, fixed base image, dependency locks and image labels remain mandatory. An old image cannot claim the repaired recipe. |
| Model resources | Every required resource name, size and SHA-256 must match. Existing manifest bytes and their installed SHA-256 are retained. Task execution still verifies file integrity. |
| Existing schema-1 manifests | Two explicitly reviewed legacy profiles can survive changes to `system_packages` only. Every other recipe field remains part of the profile hash. Unknown recipe identities are rejected. |
| Screening index | The original six-fold encoder identity remains stable for the same weights, source, patches, Python dependencies, base image and encoding policy. The actual task environment separately records the current runtime identity. |

The compatibility profiles are in `integrations/native_resources.py`; this is the
same guard mounted into native executions. They cover the existing six-fold
screening and REINVENT4 resources whose Debian Expat pin changed from bookworm
security revision `deb12u4` to `deb12u5`. They do not permit a weight, source,
compatibility patch, Python dependency or base-image change to reuse that profile.
Other programs retain their exact full-recipe requirement.

The real retained 38-compound STAT6 index has encoder fingerprint
`7df8d1f8e856325d1af49037461b9b65a132718cae18fe1cbd33e7f8b9e99a9c`.
Its original `encoding-policy.json` is a regression fixture. Both its original
model manifest and a fresh manifest from the repaired runtime must produce the
same encoder fingerprint. This check loads no weights and does not recalculate
embeddings or modify the existing index.

The focused CI also checks that changed weights, Python dependencies, sources and
base images cannot claim legacy compatibility, and that corrupted weight bytes
remain rejected. These checks establish identity compatibility, not new scientific
acceptance or equivalence of different models.

## 中文

运行镜像仍必须符合完整的当前配方和依赖锁；不能把旧镜像标成已修复。
模型资源继续校验原有清单、文件名、大小和 SHA-256。仅两份明确核对过的历史资源配置，
允许在其他配方字段完全一致时接受系统库更新，不重写原清单或重新计算筛选向量。

真实 STAT6 38 分子索引的原始编码配置用于专项回归。权重、源码、补丁、Python 依赖、
基础镜像或编码方法发生变化时，不能继续套用历史身份。校验通过只表示旧资产的身份兼容，
不代表不同模型科学等价，也不代替真实任务的结果审查。
