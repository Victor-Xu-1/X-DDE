"""Optional predicted references for the reviewed receptor-comparison study."""

from .catalogue import CASE, FILES

PREDICTED_CAPABILITIES = frozenset({"pose_exploration", "pose.cluster"})
PREDICTED_STRUCTURES = ("stat6_prediction", "stat6_predicted_construct")
PREDICTED_RECEIPTS = ("stat6_prediction_metadata", "stat6_prediction_provenance")
PREDICTION_SOURCES = (
    "https://alphafold.ebi.ac.uk/entry/P42226",
    "https://alphafold.ebi.ac.uk/files/AF-P42226-F1-model_v6.pdb",
    "https://alphafold.ebi.ac.uk/api/prediction/P42226",
    "https://alphafold.ebi.ac.uk/download",
)


def case_for(capability):
    if capability not in PREDICTED_CAPABILITIES:
        return CASE
    return CASE.model_copy(
        update={
            "files": (*CASE.files, *PREDICTED_STRUCTURES),
            "sources": (*CASE.sources, *PREDICTION_SOURCES),
        }
    )


def input_keys(capability):
    return (
        (*CASE.files, *PREDICTED_STRUCTURES, *PREDICTED_RECEIPTS)
        if capability in PREDICTED_CAPABILITIES
        else CASE.files
    )


def visible_files(capability):
    return [FILES[key] for key in case_for(capability).files]
