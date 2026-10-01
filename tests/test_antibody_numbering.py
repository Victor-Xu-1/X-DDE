"""Sequence identity, FASTA limits, native intervals and domain artifact checks."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from opendde_workbench.antibodies.contract import AntibodyNumberTask
from opendde_workbench.antibodies.fasta import read_fasta
from opendde_workbench.antibodies.native_numbering import normalize_domain
from opendde_workbench.requests import TASK_ADAPTER, input_identifiers


def test_numbering_requires_exact_fasta_source_and_one_engine():
    ref = {"asset_id": str(uuid4()), "sha256": "a" * 64, "record": 0, "conformer": 0}
    value = AntibodyNumberTask(sequences=ref, scientific_inputs=[ref])
    assert TASK_ADAPTER.validate_python(value.model_dump()).operation == "antibody_number"
    assert input_identifiers(value) == {ref["asset_id"]}
    with pytest.raises(ValidationError, match="exact input"):
        AntibodyNumberTask(sequences=ref)
    for options in (
        {"mode": "humanness"},
        {"cpu": 8},
        {"scfv": True, "arbitrary_model_url": "http://host"},
    ):
        with pytest.raises(ValidationError):
            AntibodyNumberTask(sequences=ref, scientific_inputs=[ref], options=options)


def test_fasta_rejects_ambiguous_ids_invalid_amino_acids_and_limits():
    raw = b">chain\n" + b"ACDEFGHIKLMNPQRSTVWY" * 2 + b"\n"
    assert read_fasta(raw)[0]["id"] == "chain"
    for data in (
        raw + raw,
        b">../../escape\n" + b"A" * 50,
        b">short\nAAA",
        b">bad\n" + b"B" * 30,
        b">long\n" + b"A" * 2001,
        b"A" * 100,
        b">x\n" + b"A" * 30 + b"\x00",
    ):
        with pytest.raises(ValueError):
            read_fasta(data)
    with pytest.raises(ValueError, match="50"):
        read_fasta(b"".join((f">sequence-{n}\n" + "A" * 30 + "\n").encode() for n in range(51)))


def test_native_domain_retains_inclusive_source_and_does_not_fabricate_failed_numbering(tmp_path):
    record = {"id": "original", "sequence": "A" * 26 + "CDE" + "F" * 50}
    native = {
        "chain_type": "H",
        "score": 12.0,
        "query_start": 26,
        "query_end": 28,
        "scheme": "imgt",
        "error": None,
        "numbering": [((27, " "), "C"), ((28, " "), "D"), ((29, " "), "E")],
    }
    domain = normalize_domain(native, record, "original", 0, tmp_path)
    assert domain["sequence"] == "CDE" and [
        row["source_position"] for row in domain["numbering"]
    ] == [27, 28, 29]
    assert all(row["region"] == "CDR1" for row in domain["numbering"])
    assert (tmp_path / domain["artifact"]).read_text() == ">original\nCDE\n"
    with pytest.raises(ValueError, match="original inclusive"):
        normalize_domain({**native, "query_end": 29}, record, "original", 0, tmp_path)
    failure = normalize_domain(
        {"chain_type": "F", "score": 0, "numbering": None, "error": "not an antibody"},
        record,
        "original",
        1,
        tmp_path,
    )
    assert (
        not failure["available"]
        and failure["artifact"] is None
        and not (tmp_path / "domain-001.fasta").exists()
    )


def test_independent_antibody_configuration_does_not_depend_on_opendde(settings):
    from dataclasses import replace

    from opendde_workbench.antibodies.image import VERSION, labels_match, lock_digest
    from opendde_workbench.antibodies.runtime import configuration
    from opendde_workbench.deployment.catalog import dependencies
    from opendde_workbench.engine_registry import engine_for

    with pytest.raises(ValueError, match="ANARCII"):
        configuration(settings)
    image = "sha256:" + "a" * 64
    assert configuration(replace(settings, anarcii_image=image)) == image
    assert labels_match(
        {"org.xdde.anarcii.version": VERSION, "org.xdde.anarcii.runtime-lock": lock_digest()}
    )
    assert not labels_match(
        {"org.xdde.anarcii.version": VERSION, "org.xdde.anarcii.runtime-lock": "changed"}
    )
    assert engine_for("antibody_number").id == "anarcii" and dependencies("anarcii") == ["anarcii"]
