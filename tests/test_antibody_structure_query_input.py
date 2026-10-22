"""Actual deposited coordinates and managed lineage; no model or network execution."""

import hashlib

import pytest
from native_case_inputs_fixture import stores

from opendde_workbench.examples.input_lineage import validate_input_lineage
from opendde_workbench.examples.stat6.antibody_structure_input import variable_domain_pdb
from opendde_workbench.examples.stat6.catalogue import verified_input
from opendde_workbench.examples.stat6.preparation import prepare_stat6
from opendde_workbench.requests import TASK_ADAPTER


def sources():
    raw = verified_input("dupilumab_complex")
    sequence = "".join(verified_input("dupilumab_heavy").decode().splitlines()[1:])
    return raw, sequence


def test_deposited_complete_vh_domain_preserves_every_atom_record():
    raw, sequence = sources()
    selected = variable_domain_pdb(raw, sequence)
    expected = [
        line
        for line in raw.splitlines(keepends=True)
        if line.startswith(b"ATOM  ") and line[21:22] == b"A" and 1 <= int(line[22:26]) <= 125
    ]
    actual = [line for line in selected.splitlines(keepends=True) if line.startswith(b"ATOM  ")]
    assert actual == expected and len(actual) == 938
    assert len({line[22:27] for line in actual if line[12:16].strip() == b"CA"}) == 125
    assert selected.endswith(b"TER\nEND\n")
    assert b"NOT A DIRECT STAT6 ANTIBODY" in selected


def test_mismatched_residues_alternates_duplicates_and_missing_backbones_are_rejected():
    raw, sequence = sources()
    first = next(
        line
        for line in raw.splitlines(keepends=True)
        if line.startswith(b"ATOM  ") and line[21:22] == b"A"
    )
    changed = first[:17] + b"VAL" + first[20:]
    alternate = first[:16] + b"A" + first[17:]
    nonfinite = first[:30] + b"     nan" + first[38:]
    for bad in [
        raw.replace(first, changed, 1),
        raw.replace(first, alternate, 1),
        raw.replace(first, nonfinite, 1),
        raw + first,
        raw.replace(first, b"", 1),
    ]:
        with pytest.raises(ValueError):
            variable_domain_pdb(bad, sequence)
    with pytest.raises(ValueError):
        variable_domain_pdb(raw, sequence[:-1])


def test_template_uses_a_reusable_edited_reference_with_strict_existing_lineage(settings):
    store, scientific, records = stores(settings)
    prepared = prepare_stat6("protrek-structure", scientific, records=records)
    query = prepared.objects["receptor"]
    parent = prepared.objects["dupilumab_complex"]
    assert query.parent_id == parent.id and query.validation == "file_integrity_only"
    assert query.source_job is None and query.relation == "prepared_from"
    assert prepared.study["task_target"] == "IL-4R alpha · STAT6 pathway"
    request = TASK_ADAPTER.validate_python(prepared.request)
    assert request.allow_external and request.payload["chain"] == "A"
    assert request.payload["structure_path"] == "asset:" + str(query.reference.asset_id)
    assert request.scientific_inputs == (query.reference,)
    assert (
        prepare_stat6("protrek-structure", scientific, records=records).objects["receptor"] == query
    )
    asset = scientific.assets.get(query.reference.asset_id)
    data = scientific.assets.path(asset).read_bytes()
    assert hashlib.sha256(data).hexdigest() == query.reference.sha256
    assert scientific.assets.path(
        scientific.assets.get(parent.reference.asset_id)
    ).read_bytes() == verified_input("dupilumab_complex")
    assert store.list_jobs() == []
    job = store.create(request, "query-lineage", 20, 500)
    validate_input_lineage(job, prepared, store)
