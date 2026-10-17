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
