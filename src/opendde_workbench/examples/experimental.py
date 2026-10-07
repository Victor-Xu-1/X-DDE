"""A fixed EGFR assay case derives observations from the original reviewed SDF properties."""

import csv
import hashlib
import io
import re
from uuid import uuid5

from ..research.contracts import VersionInput
from ..research.evidence_contracts import AssayConditions, EvidenceColumns, EvidenceInput
from ..research.evidence_records import NAMESPACE as EVIDENCE_NAMESPACE
from ..research.evidence_records import EvidenceRecords
from .catalogue import FILES
from .files import verified_file
from .preparation import NAMESPACE


def assay_rows(content):
    records = content.decode("utf-8").split("$$$$")
    rows = []
    for record in records:
        if not record.strip():
            continue
        lines = record.strip("\r\n").splitlines()
        compound = lines[0].strip()
        properties = {}
        for index, line in enumerate(lines):
            match = re.fullmatch(r">\s*<([^>]+)>.*", line)
            if match:
                values = []
                for item in lines[index + 1 :]:
                    if not item.strip():
                        break
                    values.append(item.strip())
                if match[1] in properties:
                    raise ValueError("A reviewed assay record contains duplicate properties.")
                properties[match[1]] = "\n".join(values)
        if (
            not re.fullmatch(r"CHEMBL[0-9]+", compound)
            or properties.get("Source_assay") != "CHEMBL944276"
            or properties.get("Source_target") != "CHEMBL203"
            or not properties.get("IC50_nM")
            or not properties.get("Source_activity_ids")
        ):
            raise ValueError("The fixed experimental case differs from its reviewed assay.")
        rows.append((compound, properties))
    if len(rows) != 177 or len({row[0] for row in rows}) != len(rows):
        raise ValueError("The reviewed EGFR case requires its 177 distinct original compounds.")
    return rows


def prepare_experimental(scientific, cache, library):
    spec = FILES["egfr_library"]
    key = uuid5(NAMESPACE, "experimental.evidence:v1:" + spec.sha256)
    records = EvidenceRecords(scientific.store, scientific.assets)
    identifier = uuid5(EVIDENCE_NAMESPACE, str(key))
    try:
        existing = records.get(identifier)
    except KeyError:
        existing = None
    if existing:
        return existing, scientific.assets.get(existing.request.source.asset_id)
    original = verified_file(cache, spec)
    rows = assay_rows(original)
    stream = io.StringIO(newline="")
    writer = csv.writer(stream)
    writer.writerow(["compound_id", "value", "relation", "source_activity_ids", "replicate_policy"])
    entries = []
    for ordinal, (compound, values) in enumerate(rows):
        writer.writerow(
            [
                compound,
                values["IC50_nM"],
                "=",
                values["Source_activity_ids"],
                values["Replicate_policy"],
            ]
        )
        entries.append(
            (
                VersionInput(
                    asset_id=library.reference.asset_id,
                    kind="molecule",
                    label=compound,
                    record=ordinal,
                    parent_id=library.id,
                    relation="derived_from",
                    notes=(
                        "Exact original EGFR assay SDF record; "
                        "the published within-assay median is retained."
                    ),
                ),
                uuid5(NAMESPACE, "experimental:compound:" + str(library.id) + ":" + str(ordinal)),
            )
        )
    versions = scientific.create_many(entries)
    asset = scientific.assets.save(
        "EGFR-CHEMBL944276-measurements.csv", "measurements", stream.getvalue().encode()
    )
    from ..scientific_objects import MoleculeRef

    value = EvidenceInput(
        name="EGFR · CHEMBL944276 experimental IC50",
        source=MoleculeRef(asset_id=asset.id, sha256=asset.sha256),
        conditions=AssayConditions(
            target="CHEMBL203 / human EGFR", assay="CHEMBL944276", species="Homo sapiens"
        ),
        endpoint="IC50",
        unit="nM",
        columns=EvidenceColumns(relation="relation"),
        citation=(
            "ChEMBL CHEMBL944276; CC-BY-SA-3.0. "
            "Published within-assay median per exact isomeric SMILES; not independent replicates."
        ),
        compound_links={
            compound: version.reference
            for (compound, _), version in zip(rows, versions, strict=True)
        },
    )
    record = records.save(value, key)
    if record.source_sha256 != hashlib.sha256(stream.getvalue().encode()).hexdigest():
        raise ValueError("The fixed experimental projection changed.")
    return record, asset
