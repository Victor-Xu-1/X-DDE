"""Protein comparison guidance is scoped independently of molecular and simulation studies."""


def study_context(study):
    return {
        **study,
        "guide": {
            "steps": [
                (
                    "选择完整的 4Y5U 与 4Y5W 原始 CIF，保留来源。",
                    "Choose the original 4Y5U and 4Y5W mmCIF files and retain their sources.",
                ),
                (
                    "靶蛋白 A → A，伙伴 B → C；4Y5W 的 A/C 属于生物组装体 1。",
                    "Map target A → A and partner B → C. "
                    "The 4Y5W A/C pair belongs to biological assembly 1.",
                ),
                (
                    "按已核对的原作者编号比较功能构象；核对两个结构中保留的 PTR641。",
                    "Compare functional states using reviewed author numbering; "
                    "inspect retained PTR641 in both inputs.",
                ),
                (
                    "核对覆盖率、同坐标位移和原生界面指标；不将几何差异解释为预测错误或亲和力。",
                    "Review coverage, same-frame displacements and native interface metrics; "
                    "geometric differences do not establish prediction error or affinity.",
                ),
            ],
            "interpretation": (
                "对齐所选蛋白链的已匹配 Cα，比较 DNA 结合前后的实验构象。"
                "未观测区域未重建；界面指标不代表亲和力或活性。",
                "Fit matched C-alpha atoms of the selected target chains and compare "
                "the experimental DNA-free and DNA-bound states. Unobserved regions are not "
                "rebuilt; interface metrics do not establish affinity or activity.",
            ),
        },
    }
