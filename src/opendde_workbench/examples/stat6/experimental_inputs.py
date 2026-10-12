"""Original STAT6 observations and molecular records, without creating an experiment record."""

import csv
import io
from uuid import uuid5

from ...research.contracts import VersionInput
from ...research.evidence_contracts import EvidenceInput
from ...scientific_objects import MoleculeRef
from .catalogue import verified_input
from .preparation import NAMESPACE


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
            "target": "Human STAT6 activation",
            "assay": "CHEMBL982109",
            "species": "Homo sapiens",
            "method": "FW4 cellular reporter assay",
        },
        endpoint="IC50",
        unit="nM",
        columns={"compound": "compound", "value": "value", "relation": "relation"},
        citation=(
            "ChEMBL CHEMBL982109; PMID:18534856; CC-BY-SA-3.0. "
            "Original reported cellular IC50; not direct binding affinity."
        ),
        compound_links={
            row["compound"]: version.reference for row, version in zip(rows, versions, strict=True)
        },
    ).model_dump(mode="json")
