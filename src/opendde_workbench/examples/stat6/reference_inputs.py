"""Optional predicted references for the reviewed receptor-comparison study."""

from .catalogue import CASE, FILES

PREDICTED_CAPABILITIES = frozenset({"pose_exploration", "pose.cluster", "openmm.refine"})
PREDICTED_STRUCTURES = ("stat6_prediction", "stat6_predicted_construct")
PREDICTED_RECEIPTS = ("stat6_prediction_metadata", "stat6_prediction_provenance")
PREDICTION_SOURCES = (
    "https://alphafold.ebi.ac.uk/entry/P42226",
    "https://alphafold.ebi.ac.uk/files/AF-P42226-F1-model_v6.pdb",
    "https://alphafold.ebi.ac.uk/api/prediction/P42226",
    "https://alphafold.ebi.ac.uk/download",
)


def case_for(capability):
    if capability == "rmsd":
        return CASE.model_copy(
            update={
                "label": ("STAT6 · DNA 结合前后的二聚体", "STAT6 · DNA-free and DNA-bound dimers"),
                "description": (
                    "对齐 4Y5U 与 4Y5W 的靶蛋白链，比较伙伴位置与界面；保留 PTR641。",
                    "Align the target chains of 4Y5U and 4Y5W, "
                    "compare partner placement and interfaces, and retain PTR641.",
                ),
                "files": (*CASE.files, "stat6_dna_bound"),
                "sources": (
                    *CASE.sources,
                    "https://www.rcsb.org/structure/4Y5W",
                    "https://data.rcsb.org/rest/v1/core/assembly/4Y5W/1",
                ),
            }
        )
    if capability == "chemprop.train":
        from .training_inputs import training_case

        return training_case(CASE)
    if capability not in PREDICTED_CAPABILITIES:
        return CASE
    update = {
        "files": (*CASE.files, *PREDICTED_STRUCTURES),
        "sources": (*CASE.sources, *PREDICTION_SOURCES),
    }
    if capability == "openmm.refine":
        update.update(
            label=(
                "STAT6 · 连续预测构象准备",
                "STAT6 · Continuous predicted-structure preparation",
            ),
            description=(
                "使用来源明确的 AlphaFold v6 113–658 构象进行有限的约束优化；"
                "它是预测参考，不是实验结合结构。",
                "Bounded restrained preparation of the documented AlphaFold v6 "
                "113–658 construct; a predicted reference, not an experimental bound structure.",
            ),
        )
    return CASE.model_copy(update=update)


def input_keys(capability):
    return (
        (*CASE.files, *PREDICTED_STRUCTURES, *PREDICTED_RECEIPTS)
        if capability in PREDICTED_CAPABILITIES
        else case_for(capability).files
    )


def visible_files(capability):
    return [FILES[key] for key in case_for(capability).files]
