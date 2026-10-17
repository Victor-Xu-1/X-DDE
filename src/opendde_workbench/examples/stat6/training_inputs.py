"""One curated SPR endpoint; reported cellular observations keep their original owner."""

FILES = ("stat6_spr_library", "stat6_spr_provenance")
SOURCES = (
    "https://www.bindingdb.org/rwd/jsp/dbsearch/PrimarySearch_ki.jsp?tag=entry&submit=Search&entryid=13376",
    "https://www.bindingdb.org/rwd/jsp/dbsearch/assay.jsp?assayid=1&entryid=13376",
    "https://patents.google.com/patent/US20250340551A1/en",
)


def training_case(case):
    return case.model_copy(
        update={
            "label": ("STAT6 · SPR 亲和力建模", "STAT6 · SPR affinity modelling"),
            "description": (
                "同一 STAT6 SPR 实验的 163 个明确分子，以原始 Kd 换算 pKd；"
                "保留原记录、筛选规则与排除项，不混入细胞 IC50。",
                "163 distinct structures from one STAT6 SPR assay, with pKd transformed "
                "from reported Kd. Original observations, curation rules and exclusions "
                "are retained separately from cellular IC50 data.",
            ),
            "files": (*case.files, *FILES),
            "sources": (*case.sources, *SOURCES),
        }
    )


def training_context(study):
    return {
        **study,
        "supporting_sources": {
            **study["supporting_sources"],
            "stat6_spr_training": {
                "assay": "BindingDB:13376:1",
                "patent": "US20250340551A1",
                "source_doi": "10.7270/Q2ZC87P0",
                "original_observations": 192,
                "retained_molecules": 163,
                "excluded_records": 29,
                "reported_endpoint": "Kd",
                "reported_unit": "nM",
                "training_label": "pKd",
                "transform": "9 - log10(reported Kd in nM)",
                "license": "CC-BY-3.0-US",
            },
        },
        "guide": {
            "steps": [
                (
                    "载入同一 STAT6 SPR 实验的 163 个分子；原始 Kd 与来源编号随结构保存。",
                    "Load 163 molecules from one STAT6 SPR assay; each structure retains "
                    "its reported Kd and source identity.",
                ),
                (
                    "选择 pKd 标签与 pKd 单位；该标签由 Kd（nM）换算，不是细胞 IC50。",
                    "Select the pKd field and pKd units. This label is transformed from "
                    "Kd in nM, rather than cellular IC50.",
                ),
                (
                    "使用骨架分割保留独立验证与测试集，再选择有限训练轮数。",
                    "Retain separate validation and test sets by scaffold before choosing "
                    "a bounded training duration.",
                ),
                (
                    "核对来源后递交；查看保留测试集的观测值、预测值与误差，再判断适用范围。",
                    "Confirm the source before submission. Review held-out observations, "
                    "predictions and errors before judging applicability.",
                ),
            ],
            "interpretation": (
                "训练结果是此单一实验系列的预测基线，不能直接代表其他实验、"
                "指定研究小分子或 PROTAC 的实测亲和力。来源未独立复现实验；"
                "原始 192 条记录及排除规则保存在来源文件中。",
                "The model is a baseline for this one assay series. It does not establish "
                "measured affinity for other assays, the supplied study warhead or the PROTAC. "
                "The source experiments have not been independently reproduced; "
                "the source file retains all 192 observations and explicit exclusions.",
            ),
        },
    }
