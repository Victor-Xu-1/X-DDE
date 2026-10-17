"""Original STAT6 observations and molecular records, without creating an experiment record."""

import csv
import io
from uuid import uuid5

from ...research.contracts import VersionInput
from ...research.evidence_contracts import EvidenceInput
from ...scientific_objects import MoleculeRef
from .catalogue import verified_input
from .preparation import NAMESPACE


def experimental_context(study):
    return {
        **study,
        "guide": {
            **study["guide"],
            "interpretation": (
                "本例导入同一细胞报告实验的 38 条 STAT6 IC50 观测，"
                "保留来源、单位、未知条件及原始分子关联。"
                "这些数值不是直接结合亲和力，也不是指定研究分子的预测值。",
                "This example imports 38 STAT6 IC50 observations from one cellular reporter assay, "
                "preserving their source, units, unknown conditions and original molecular links. "
                "They are neither direct binding affinities nor predictions "
                "for the supplied study molecule.",
            ),
        },
    }


def evidence_draft(scientific, objects, asset):
    rows = list(csv.DictReader(io.StringIO(verified_input("stat6_measurements").decode())))
    library = objects["stat6_assay_library"]
    versions = scientific.create_many(
        [
            (
                VersionInput(
                    asset_id=library.reference.asset_id,
                    kind="molecule",
                    label=row["compound"],
                    record=i,
                    parent_id=library.id,
                    relation="derived_from",
                    notes=(
                        "Exact ChEMBL STAT6 cellular assay molecular record; "
                        "not the supplied study warhead."
                    ),
                ),
                uuid5(NAMESPACE, "STAT6-assay:" + library.reference.sha256 + ":" + str(i)),
            )
            for i, row in enumerate(rows)
        ]
    )
    return EvidenceInput(
        name="STAT6 · CHEMBL982109 · reported cellular IC50",
        source=MoleculeRef(asset_id=asset.id, sha256=asset.sha256),
        conditions={
            "target": "STAT6 activation (ChEMBL5401; homologous assignment)",
            "assay": "CHEMBL982109",
            # CHEMBL982109 does not report the assay organism. The assigned
            # target's organism cannot supply the missing experimental condition.
            "species": "",
            "method": "FW4 cellular reporter assay",
        },
        endpoint="IC50",
        unit="nM",
        columns={"compound": "compound", "value": "value", "relation": "relation"},
        citation=(
            "ChEMBL CHEMBL982109; PMID:18534856; CC-BY-SA-3.0. "
            "Original reported cellular IC50; not direct binding affinity."
            " Assay organism not reported; ChEMBL homologous assignment, confidence 8."
        ),
        compound_links={
            row["compound"]: version.reference for row, version in zip(rows, versions, strict=True)
        },
    ).model_dump(mode="json")
