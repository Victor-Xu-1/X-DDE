"""Short study questions retain the original experimental target and the limits of each stage."""

from .stage_hints import STAGES

PURPOSES = {
    "del.library": (
        "核对 DEL006 的三轮砌块、条码和化学规则。",
        "Review DEL006's three building-block cycles, barcodes and chemical rules.",
    ),
    "del.enumerate": (
        "生成已报道成员及相邻砌块组合的计算结构。",
        "Enumerate the reported member and nearby building-block combinations.",
    ),
    "del.decode": (
        "解码上游公开的 1,000 条 BRD4 原始读段，并查看未匹配原因。",
        "Decode the 1,000 public BRD4 raw reads and inspect unmatched-read reasons.",
    ),
    "del.count": (
        "按样品和化合物核对原始读数、UMI 去重与校正计数。",
        "Review raw reads, unique UMIs and corrected counts within each sample and compound.",
    ),
    "del.analyze": (
        "比较 BRD4 靶点样本、对应空白对照和两个洗脱组的富集证据。",
        "Compare BRD4 target samples, matched matrix controls and the two eluates.",
    ),
    "del.series": (
        "用 B、C 两轮砌块查看系列富集和实际观测覆盖。",
        "Inspect series enrichment and observed coverage across building-block cycles B and C.",
    ),
    "del.model": (
        "建立砌块分组留出的富集基线，并与均值基线比较。",
        "Train an enrichment baseline with a held-out building-block cycle and a mean baseline.",
    ),
    "del.candidates": (
        "将真实编码成员另存为明确封端的游离构象假设。",
        "Save a real encoded member as an explicitly capped unbound conformer hypothesis.",
    ),
    "del.followup": (
        "把文献报告的验证证据关联回编码成员，保留其原始定性范围。",
        "Link reported follow-up evidence to the encoded member within its qualitative scope.",
    ),
}


def context(capability):
    from .catalogue import FILES

    descriptions = {
        "del_definition": (
            "三轮各 96 个砌块，保留真实条码、结构与化学规则。",
            "Three cycles of 96 blocks; original barcodes, structures and chemical rules.",
        ),
        "del_reads": (
            "公开的 1,000 条真实读段；不能重建完整的八样品计数。",
            "1,000 real public reads; this subset cannot reconstruct the eight-sample counts.",
        ),
        "del_counts": (
            "全部 518,285 个观测成员、八列原始读数；两组洗脱分别对照。",
            "All 518,285 observed members and eight raw count columns; matched eluate controls.",
        ),
        "del_followup": (
            "文献报告的定性结合验证；不补造精确 KD。",
            "Reported qualitative binding validation; no invented numerical KD.",
        ),
    }
    return {
        "id": "del6",
        "profile": "del6",
        "target": "BRD4",
        "organism": "Homo sapiens",
        "template_kind": "research_study",
        "molecules": [],
        "materials": [
            {
                "name": spec.name,
                "bytes": spec.bytes,
                "url": spec.url,
                "kind": spec.kind,
                "description": descriptions[key],
            }
            for key, spec in FILES.items()
        ],
        "required_materials": [],
        "guide": {
            "steps": [PURPOSES[capability], *STAGES[capability]],
            "interpretation": (
                (
                    "原实验靶点是 BRD4，不是 STAT6。公开读段只有 1,000 条，"
                    "不能重建完整的八样品实验；全量计数另有来源。"
                    "富集不是亲和力；单个空白样品不能证明生物学重复性。"
                    "封端构象不是已合成的脱 DNA 化合物或结合姿势；"
                    "文献定性验证不补造精确 KD。"
                ),
                (
                    "The original target is BRD4, not STAT6. The 1,000 public raw reads cannot "
                    "reconstruct the separate eight-sample count dataset. "
                    "Enrichment is not affinity; "
                    "one matrix control does not establish biological reproducibility. Capped "
                    "conformers are neither confirmed off-DNA compounds nor binding poses; "
                    "qualitative literature validation is not an invented numerical KD."
                ),
            ),
        },
    }
