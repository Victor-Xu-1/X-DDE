"""Sealed provenance transport checks; no native computation or scientific acceptance."""

import hashlib

import pytest
from native_case_inputs_fixture import retain, stores

from opendde_workbench.alignment_slice import slice_columns
from opendde_workbench.examples.input_lineage import validate_input_lineage
from opendde_workbench.examples.stat6.catalogue import verified_input
from opendde_workbench.examples.stat6.domain_inputs import (
    domain_coordinates,
    reviewed_domain_inputs,
)
from opendde_workbench.examples.stat6.preparation import prepare_stat6, register_input
from opendde_workbench.requests import TASK_ADAPTER


def source(settings):
    store, scientific, records = stores(settings)
    prepared = prepare_stat6("target-msa", scientific, records=records)
    canonical = prepared.sequences["protein"]
    domain = canonical[516:632]
    # Explicit flanking versus internal insertion; duplicate identifiers retained.
    homolog = "-" * 516 + "aa" + domain[0] + "gg" + domain[1:] + "tt" + "-" * 215
    rows = (
        f">query\n{canonical}\n>same\n{homolog}\n>same\n{homolog}\n"
        f">outside\n{canonical[:100]}{'-' * 747}\n"
    ).encode()
    request = prepared.request
    job, output = retain(
        settings,
        store,
        scientific,
        records,
        "target-msa",
        request,
        {
            "result.json": {
                "operation": "harness",
                "complete": True,
                "tool": "target-msa",
                "result": {
                    "sequence_sha256": hashlib.sha256(canonical.encode()).hexdigest(),
                    "unpaired_msa_path": "native.a3m",
                    "alignment_files": [
                        {
                            "artifact": "native.a3m",
                            "sha256": hashlib.sha256(rows).hexdigest(),
                            "bytes": len(rows),
                            "rows": 4,
                            "columns": 847,
                        }
                    ],
                },
                "alignments": ["native.a3m"],
            },
            "native.a3m": rows,
        },
    )
    parent = register_input(scientific, "stat6_predicted_construct")
    return store, scientific, records, canonical, job, output, parent


def test_explicit_domain_overhang_policy_preserves_internal_insertions():
    rows = [(">query", "ACDEF"), (">homolog", "ACaaDggEFtt")]
    assert slice_columns(rows, "ACDEF", 2, 5)[0][1][1] == "aaDggEF"
    assert slice_columns(rows, "ACDEF", 2, 5, keep_leading_insertions=False)[0][1][1] == "DggEF"


def test_missing_search_does_not_admit_unreviewed_alignment(settings):
    _, scientific, records = stores(settings)
    parent = register_input(scientific, "stat6_predicted_construct")
    assert reviewed_domain_inputs(scientific, records, "A" * 847, parent) is None


def test_exact_domain_sources_lineage_and_prediction_consumers(settings):
    store, scientific, records, canonical, job, output, parent = source(settings)
    originals = {file.name: file.read_bytes() for file in output.iterdir()}
    result = reviewed_domain_inputs(scientific, records, canonical, parent)
    assert result == reviewed_domain_inputs(scientific, records, canonical, parent)
    assert result["sequence"] == canonical[516:632]
    assert result["provenance"]["retained_rows"] == 3
    assert result["provenance"]["excluded_all_gap_rows"] == 1
    objects = result["objects"]
    msa = objects["sh2_msa"]
    assert msa.parent_id == objects["sh2_msa_parent"].id
    assert str(msa.source_job) == job.id
    assert msa.validation == "file_integrity_only"
    assert objects["sh2_reference"].parent_id == parent.id
    asset = scientific.assets.get(msa.reference.asset_id)
    data = scientific.assets.path(asset).read_text()
    assert data.count(">same\n") == 2
    assert "aa" not in data and "tt" not in data and "gg" in data
    coords = scientific.assets.path(
        scientific.assets.get(objects["sh2_reference"].reference.asset_id)
    ).read_bytes()
    assert coords == domain_coordinates(
        verified_input("stat6_predicted_construct"), result["sequence"]
    )
    assert b"PREDICTED REFERENCE" in coords
    for capability in ("predict", "boltz.predict", "mpnn", "esm2", "boltzgen.design"):
        prepared = prepare_stat6(capability, scientific, records=records)
        assert prepared.objects["sh2_msa"].id == msa.id
        assert prepared.sequence_sources["sh2_sequence"] == (canonical[516:632],)
        if capability in {"predict", "boltz.predict"}:
            assert prepared.sequences["protein"] == canonical[516:632]
            task = store.create(TASK_ADAPTER.validate_python(prepared.request), capability, 20, 500)
            validate_input_lineage(task, prepared, store)
        if capability == "esm2":
            request = prepared.request
            request["payload"]["parent_chains"] = {"A": canonical[516:632]}
            request["payload"]["mutable_positions"] = {"A": [32, 36, 63, 68, 93]}
            request["scientific_inputs"] = [
                prepared.objects["sh2_sequence"].reference.model_dump(mode="json")
            ]
            task = store.create(TASK_ADAPTER.validate_python(request), "domain-sequence", 20, 500)
            validate_input_lineage(task, prepared, store)
    # An existing uploaded file gets its genuine derived version, not a new hash authority.
    prepared = prepare_stat6("predict", scientific, records=records)
    request = prepared.request
    request["components"][0].pop("source_sequence")
    request["components"] = request["components"][:1]
    request["scientific_inputs"] = []
    task = store.create(TASK_ADAPTER.validate_python(request), "uploaded-domain", 20, 500)
    validate_input_lineage(task, prepared, store)
    assert originals == {file.name: file.read_bytes() for file in output.iterdir()}


def test_changed_search_sequence_or_native_bytes_are_rejected(settings):
    _, scientific, records, canonical, _, output, parent = source(settings)
    with pytest.raises(ValueError, match="canonical STAT6"):
        reviewed_domain_inputs(scientific, records, canonical[:-1] + "X", parent)
    (output / "native.a3m").write_text(">changed\nACDE\n")
    with pytest.raises(ValueError):
        reviewed_domain_inputs(scientific, records, canonical, parent)


def test_domain_coordinate_identity_and_backbone_are_not_inferred():
    canonical = "".join(verified_input("stat6_sequence").decode().splitlines()[1:])
    original = verified_input("stat6_predicted_construct")
    with pytest.raises(ValueError, match="canonical sequence"):
        domain_coordinates(original, "A" * 116)
    with pytest.raises(ValueError, match="backbone"):
        domain_coordinates(b"END\n", canonical[516:632])
