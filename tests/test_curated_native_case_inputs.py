"""Only exact reviewed results authorize curated inputs; source evidence stays immutable."""

import json

import pytest
from native_case_inputs_fixture import prediction_sources, scored_sources, stores

from opendde_workbench.alignment_slice import a3m_bytes, slice_columns
from opendde_workbench.examples.input_lineage import validate_input_lineage
from opendde_workbench.examples.stat6.prediction_inputs import reviewed_prediction_inputs
from opendde_workbench.examples.stat6.preparation import prepare_stat6
from opendde_workbench.examples.stat6.sequence_populations import reviewed_sequence_populations
from opendde_workbench.requests import TASK_ADAPTER


def test_column_selection_preserves_insertions_order_and_excludes_only_empty_rows():
    rows = [(">query", "ACDEFG"), (">homolog", "ACaD-EG"), (">outside", "AC----")]
    selected, excluded = slice_columns(rows, "ACDEFG", 2, 5)
    assert selected == [(">query", "DEF"), (">homolog", "aD-E")]
    assert [row["header"] for row in excluded] == [">outside"]
    assert a3m_bytes(selected) == b">query\nDEF\n>homolog\naD-E\n"
    assert rows[1][1] == "ACaD-EG"
    with pytest.raises(ValueError):
        slice_columns(rows, "ACDEFG", -1, 5)
    with pytest.raises(ValueError):
        slice_columns([(">query", "ACDEFG"), (">broken", "ACD")], "ACDEFG", 1, 4)


def test_missing_reviewed_sources_never_fabricate_a_prepared_input(settings):
    store, scientific, records = stores(settings)
    assert reviewed_prediction_inputs(scientific, records, "ACDE") is None
    assert reviewed_sequence_populations(scientific, records, "ACDE") == {}
    assert store.list_jobs() == []


def test_exact_construct_alignment_and_both_prediction_consumers(settings):
    store, scientific, records, canonical, imported, features, output = prediction_sources(settings)
    original = {p.relative_to(output): p.read_bytes() for p in output.rglob("*") if p.is_file()}
    curated = reviewed_prediction_inputs(scientific, records, canonical)
    assert curated["sequence"] == canonical[112:658]
    assert curated["provenance"]["canonical_range_inclusive"] == [113, 658]
    assert curated["provenance"]["source_rows"] == 3
    assert curated["provenance"]["retained_rows"] == 2
    obj = curated["objects"]["prediction_msa"]
    assert obj.validation == "file_integrity_only"
    assert obj.parent_id == curated["objects"]["prediction_msa_parent"].id
    assert str(obj.source_job) == features.id
    assert str(curated["objects"]["prediction_construct"].source_job) == imported.id
    assert reviewed_prediction_inputs(scientific, records, canonical) == curated
    for capability in ("boltz.predict", "predict"):
        prepared = prepare_stat6(capability, scientific, records=records)
        request = TASK_ADAPTER.validate_python(prepared.request)
        assert prepared.sequences["protein"] == canonical[112:658]
        if capability == "boltz.predict":
            assert [item.role for item in request.inputs] == ["ligand", "msa"]
            assert request.payload.components[0].msa == obj.reference
            assert request.payload.samples == 1
        else:
            assert request.components[0].unpaired_msa == obj.reference.asset_id
            assert request.parameters.feature_mode == "uploaded"
        job = store.create(request, capability, 20, 500)
        validate_input_lineage(job, prepared, store)
    assert {
        p.relative_to(output): p.read_bytes() for p in output.rglob("*") if p.is_file()
    } == original


def test_corrupted_native_alignment_or_nonmatching_construct_is_not_admitted(settings):
    _, scientific, records, canonical, _, _, output = prediction_sources(settings)
    with pytest.raises(ValueError, match="canonical sequence interval"):
        reviewed_prediction_inputs(scientific, records, canonical[1:])
    (output / "msa/non_pairing.a3m").write_text(">changed\nACDE\n")
    with pytest.raises(ValueError):
        reviewed_prediction_inputs(scientific, records, canonical)


def test_actual_scored_hypotheses_produce_truthful_lineage_and_comparison_inputs(settings):
    store, scientific, records, canonical, native, output = scored_sources(settings)
    original = (output / "result.json").read_bytes()
    objects = reviewed_sequence_populations(scientific, records, canonical)
    history = json.loads(
        scientific.assets.path(
            scientific.assets.get(objects["proposal_history"].reference.asset_id)
        ).read_text()
    )
    assert [row["candidate_id"] for row in history["candidates"]] == [
        "STAT6-WT",
        "STAT6-N614A",
        "STAT6-N614Q",
    ]
    assert [row["metrics"]["loss"] for row in history["candidates"]] == [1.0, 1.1, 1.2]
    assert [row["metrics"]["esm2_pll"] for row in history["candidates"]] == [-1.0, -1.1, -1.2]
    assert history["candidates"][1]["mutations"] == ["A:N614A"]
    assert all(not row["metadata"]["fold_evaluated"] for row in history["candidates"])
    assert all(
        str(obj.source_job) == native.id and obj.validation == "file_integrity_only"
        for obj in objects.values()
    )
    assert reviewed_sequence_populations(scientific, records, canonical) == objects
    for capability in ("evolution", "compare"):
        prepared = prepare_stat6(capability, scientific, records=records)
        request = TASK_ADAPTER.validate_python(prepared.request)
        assert request.tool == capability
        assert prepared.study["required_materials"] == []
        job = store.create(request, capability, 20, 500)
        validate_input_lineage(job, prepared, store)
    assert (output / "result.json").read_bytes() == original


def test_scored_population_requires_its_exact_canonical_parent(settings):
    _, scientific, records, parent, _, _ = scored_sources(settings)
    with pytest.raises(ValueError):
        reviewed_sequence_populations(scientific, records, parent[1:])
