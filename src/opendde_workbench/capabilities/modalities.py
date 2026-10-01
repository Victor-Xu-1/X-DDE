"""Overlapping research categories, not additional engine capabilities.

Explicit membership describes usable inputs or target context. A category never
asserts native generation, therapeutic suitability or scientific validation.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict

ModalityId = Literal[
    "biologic", "chemical", "rna", "dna", "antibody", "protein", "peptide", "small_molecule"
]


class DrugModality(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    id: ModalityId
    label: tuple[str, str]
    help: tuple[str, str]


MODALITIES = (
    DrugModality(
        id="biologic",
        label=("生物药", "Biologics"),
        help=(
            "蛋白、抗体与肽相关研究；与细分类别重叠。",
            "Protein, antibody and peptide research; overlaps with specific categories.",
        ),
    ),
    DrugModality(
        id="chemical",
        label=("化药", "Chemical drugs"),
        help=(
            "当前主要覆盖小分子及其蛋白靶标的配套流程。",
            "Currently covers small molecules and supporting protein-target workflows.",
        ),
    ),
    DrugModality(
        id="rna",
        label=("RNA", "RNA"),
        help=(
            "当前支持 RNA 结构输入、复合物预测与 MSA 准备；不是通用 RNA 药物设计。",
            "RNA structure inputs, complex prediction and MSA preparation; "
            "not general RNA drug design.",
        ),
    ),
    DrugModality(
        id="dna",
        label=("DNA", "DNA"),
        help=(
            "当前支持 DNA 结构输入与复合物预测；不是通用 DNA 药物设计。",
            "DNA structure inputs and complex prediction; not general DNA drug design.",
        ),
    ),
    DrugModality(
        id="antibody",
        label=("抗体", "Antibodies"),
        help=(
            "抗体设计、序列、结构与接触分析；同时属于生物药和蛋白研究。",
            "Antibody design, sequences, structures and contacts; "
            "also biologic and protein research.",
        ),
    ),
    DrugModality(
        id="protein",
        label=("蛋白", "Proteins"),
        help=(
            "蛋白序列与结构研究，也包括作为小分子靶标的蛋白处理。",
            "Protein sequence and structure research, "
            "including proteins used as small-molecule targets.",
        ),
    ),
    DrugModality(
        id="peptide",
        label=("肽", "Peptides"),
        help=(
            "可表示为氨基酸序列的肽使用蛋白流程；特殊修饰需按具体输入契约核对。",
            "Amino-acid-sequence peptides use protein workflows; "
            "check modified peptides against input contracts.",
        ),
    ),
    DrugModality(
        id="small_molecule",
        label=("小分子", "Small molecules"),
        help=(
            "小分子生成、性质、编辑、相互作用及蛋白靶标口袋准备；与化药重叠。",
            "Molecule generation, properties, edits, interactions and protein-pocket preparation; "
            "overlaps with chemical drugs.",
        ),
    ),
)

_ALL = tuple(item.id for item in MODALITIES)
_SMALL = ("chemical", "small_molecule")
_PROTEIN = ("biologic", "antibody", "protein", "peptide")
_ANTIBODY = ("biologic", "antibody", "protein")
_CONTEXT = ("biologic", "chemical", "protein", "small_molecule")

# No fallback: newly registered capabilities must declare reviewed applicability.
_MEMBERSHIP = {
    "discovery.import": _ALL,
    "discovery.target": _ALL,
    "discovery.disease": _ALL,
    "predict": _ALL,
    "properties": _SMALL,
    "campaign": _ANTIBODY,
    "esm": _PROTEIN,
    "esm2": _PROTEIN,
    "mpnn": _PROTEIN,
    "fold": _ANTIBODY,
    "epitope": _ANTIBODY,
    "structure": _SMALL + _ANTIBODY,
    "rmsd": _ANTIBODY,
    "evolution": _ANTIBODY,
    "compare": _ANTIBODY,
    "protrek-sequence": _PROTEIN,
    "protrek-structure": _PROTEIN,
    "target-msa": _ANTIBODY,
    "features": _PROTEIN + ("rna",),
    "import": _ALL,
    "resources": _ALL,
    "native.inspect": _ALL,
    "workflows": _ALL,
    "regions": _SMALL,
    "biopython.prepare": _ALL,
    "biopython.ensemble": _CONTEXT + ("antibody", "peptide"),
    "chemistry.states": _SMALL,
    "chemistry.screen": _SMALL,
    "pose_exploration": _CONTEXT,
    "p2rank.detect": _CONTEXT,
    "gnina.dock": _CONTEXT,
    "gnina.score": _CONTEXT,
    "gnina.minimize": _CONTEXT,
    **{
        "diffsbdd." + mode: _SMALL
        for mode in (
            "identity",
            "generate",
            "inpaint",
            "diversify",
            "optimize",
            "edit",
            "interactions",
            "properties",
            "export",
        )
    },
    "diffsbdd.pocket": _CONTEXT,
    "diffsbdd.prepare": _CONTEXT,
}
_SHARED = {"import", "resources", "workflows", "discovery.import"}
_TARGET_CONTEXT = {
    "discovery.target",
    "discovery.disease",
    "pose_exploration",
    "biopython.ensemble",
    "p2rank.detect",
    "diffsbdd.pocket",
    "diffsbdd.prepare",
    "gnina.dock",
    "gnina.score",
    "gnina.minimize",
}


def modality_metadata(identifier: str) -> dict:
    return {
        "modalities": _MEMBERSHIP[identifier],
        "modality_role": "shared"
        if identifier in _SHARED
        else "target_context"
        if identifier in _TARGET_CONTEXT
        else "research_object",
    }


def modality_catalogue() -> list[dict]:
    return [item.model_dump(mode="json") for item in MODALITIES]
