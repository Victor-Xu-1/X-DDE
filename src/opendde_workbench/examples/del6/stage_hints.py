"""Bilingual hints match each DEL questionnaire stage and its actual evidence."""

STAGES = {
    "del.library": (
        (
            "核对三轮砌块及原始条码定义。",
            "Check the three building-block cycles and original barcode definition.",
        ),
        (
            "检查条码间距与结构规则，不把名义组合数视为已合成分子数。",
            "Inspect barcode separation and chemical rules; "
            "nominal combinations are not confirmed products.",
        ),
        (
            "提交后查看砌块结构、编码间距及未通过的定义检查。",
            "After submission, inspect block structures, coding distances "
            "and failed definition checks.",
        ),
    ),
    "del.enumerate": (
        (
            "选择已报道成员及相邻砌块组合；未观测组合不等于实验命中。",
            "Choose the reported member and neighboring block combinations; "
            "unobserved combinations are not experimental hits.",
        ),
        (
            "保留原始编码结构和连接标记；计算枚举不证明合成成功。",
            "Retain original encoded structures and attachment markers; "
            "enumeration does not prove synthesis.",
        ),
        (
            "提交后逐个检查二维结构与原始 MOL，区分编码结构和游离化合物。",
            "Inspect each 2D structure and original MOL; "
            "distinguish encoded structures from off-DNA compounds.",
        ),
    ),
    "del.decode": (
        (
            "核对 1,000 条公开读段、样本归属和 DEL006 原始定义。",
            "Check the 1,000 public reads, sample assignment and original DEL006 definition.",
        ),
        (
            "选择条码匹配容差与读段质量限制；库成员识别和 UMI 完整性分别判断。",
            "Choose barcode tolerances and read-quality limits; "
            "assess member calls and UMI completeness separately.",
        ),
        (
            "提交后核对解码失败、逐位置质量与完整 UMI；本子集不能重建全量筛选。",
            "Inspect decoding failures, per-position quality and complete UMIs; "
            "this subset cannot reconstruct the full selection.",
        ),
    ),
    "del.count": (
        (
            "选择已核验的测序解码结果。",
            "Select the reviewed sequencing-decoding result.",
        ),
        (
            "按样本与成员选择 UMI 计数方案；完整 UMI 才可去重，原始读数另行保留。",
            "Choose member- and sample-scoped UMI counting; "
            "only complete UMIs are deduplicated, while raw reads remain available.",
        ),
        (
            "提交后核对原始读数、完整 UMI 与排除记录；缺少完整 UMI 不代表零分子。",
            "Reconcile raw reads, complete UMIs and exclusions; "
            "missing complete UMIs do not imply zero molecules.",
        ),
    ),
    "del.analyze": (
        (
            "核对八列原始读数；每组洗脱的三列靶点样本对应各自空白。",
            "Check all eight raw-count columns; each eluate's three target-sample columns "
            "use their matched matrix control.",
        ),
        (
            "选择最低计数与富集阈值，保留原始读数的 PCR 偏倚及对照限制。",
            "Choose count and enrichment thresholds, retaining the PCR bias "
            "and control limitations of raw reads.",
        ),
        (
            "核对两组洗脱的背景、计数区间及样本差异；富集不是亲和力。",
            "Inspect both eluates' backgrounds, count intervals and sample differences; "
            "enrichment is not affinity.",
        ),
    ),
    "del.series": (
        (
            "选择已核验的富集结果，并确认比较组。",
            "Select the reviewed enrichment result and confirm the comparison.",
        ),
        (
            "比较 B、C 砌块组合的观测覆盖与系列分布。",
            "Compare observed coverage and series patterns for cycles B and C.",
        ),
        (
            "检查系列图、实际成员数与背景；缺少观测不等于无活性。",
            "Inspect series maps, observed member counts and background; "
            "missing observations do not imply inactivity.",
        ),
    ),
    "del.model": (
        (
            "确认已完成的富集结果及研究比较组。",
            "Confirm the completed enrichment result and study comparison.",
        ),
        (
            "按砌块分组留出，检查训练范围与均值基线，避免结构信息泄漏。",
            "Hold out building-block groups and inspect training scope "
            "and the mean baseline to avoid structural leakage.",
        ),
        (
            "核对留出指标与误差分布；富集模型不预测实测亲和力。",
            "Inspect held-out metrics and error distributions; "
            "an enrichment model does not predict measured affinity.",
        ),
    ),
    "del.candidates": (
        (
            "选择编码成员，明确连接位点及封端方式。",
            "Select encoded members and define their attachment sites and caps.",
        ),
        (
            "保留编码来源，检查封端结构及构象生成方案。",
            "Retain encoded provenance and check the capped structure and conformer protocol.",
        ),
        (
            "检查二维与最小化三维构象；这些是假设，不是已合成化合物或结合姿势。",
            "Inspect 2D structures and minimized 3D conformers; "
            "these are hypotheses, not synthesized compounds or binding poses.",
        ),
    ),
    "del.followup": (
        (
            "按编码成员关联原文的定性验证证据。",
            "Associate the original qualitative follow-up evidence with its encoded member.",
        ),
        (
            "保留原始验证类型、来源与定性范围，不补造数值 KD。",
            "Retain the original evidence type, source and qualitative scope "
            "without inventing numerical KD values.",
        ),
        (
            "核对成员关联及验证说明，区分计算富集和原文实验。",
            "Check member links and evidence notes, distinguishing calculated enrichment "
            "from reported experiments.",
        ),
    ),
}
