"""Real CSV, unit, immutable-record and deletion boundaries; no model inference."""

import csv
import io
import json
from uuid import uuid4

import pytest

from opendde_workbench.assets import AssetStore
from opendde_workbench.research.evidence_contracts import (
    AssayConditions,
    EvidenceColumns,
    EvidenceDocument,
    EvidenceInput,
)
from opendde_workbench.research.evidence_export import export_csv
from opendde_workbench.research.evidence_parse import parse_observations
from opendde_workbench.research.evidence_records import EvidenceRecords
from opendde_workbench.research.evidence_values import summaries
from opendde_workbench.scientific_objects import MoleculeRef
from opendde_workbench.store import ConflictError, Store


def request(content, **changes):
    import hashlib

    return EvidenceInput(
        name="Controlled reported-value protocol",
        source=MoleculeRef(asset_id=uuid4(), sha256=hashlib.sha256(content).hexdigest()),
        conditions=AssayConditions(target="Controlled target", assay="assay-one"),
        citation="Controlled parser fixture, not an experimental efficacy claim",
        columns=EvidenceColumns(compound="compound", value="value", relation="relation"),
        **changes,
    )


def document(content, value):
    return EvidenceDocument(
        id=uuid4(),
        request=value,
        source_sha256=value.source.sha256,
        observations=parse_observations(content, value),
        created_at="controlled",
    )


def test_molar_normalization_keeps_reported_censoring_and_original_values():
    raw = b"compound,value,relation\nA,0.25,=\nA,0.5,>\n"
    value = request(raw, unit="uM")
    result = document(raw, value)
    assert [row.normalized_value for row in result.observations] == [250, 500]
    assert [row.reported_value for row in result.observations] == ["0.25", "0.5"]
    summary = summaries(result)[0]
    assert summary["median_if_exact"] == 250
    assert summary["exact_count"] == 1 and summary["censored_count"] == 1
    exported = list(csv.DictReader(io.StringIO(export_csv(result).decode("utf-8-sig"))))
    assert exported[1]["reported_relation"] == ">" and exported[1]["reported_value"] == "0.5"


@pytest.mark.parametrize(
    "lower,upper,conflict", [(">=", "<=", False), (">", "<=", True), (">=", "<", True)]
)
def test_equal_censoring_bounds_respect_open_and_closed_relations(lower, upper, conflict):
    raw = f"compound,value,relation\nA,10,{lower}\nA,10,{upper}\n".encode()
    assert summaries(document(raw, request(raw)))[0]["incompatible_reported_bounds"] is conflict


@pytest.mark.parametrize("value", ["nan", "inf", "-1", "1e999", "1e-999"])
def test_invalid_or_unrepresentable_concentrations_are_rejected(value):
    raw = f"compound,value,relation\nA,{value},=\n".encode()
    with pytest.raises(ValueError):
        parse_observations(raw, request(raw))


@pytest.mark.parametrize(
    "raw",
    [
        b"compound,value,value,relation\nA,1,2,=\n",
        b"compound,value,relation\nA,1,=,extra\n",
        b"compound,value,relation\nA,1\n",
        b"compound,value,relation\nA,\x00,=\n",
        b"compound,value,relation\nA,\xff,=\n",
    ],
)
def test_ambiguous_incomplete_or_invalid_sources_never_partially_import(raw):
    with pytest.raises(ValueError):
        parse_observations(raw, request(raw))


def test_percent_noise_is_retained_for_review_instead_of_clamped():
    raw = b"compound,value,relation\nA,-4,=\nA,104,=\n"
    result = parse_observations(raw, request(raw, endpoint="inhibition", unit="%"))
    assert [row.normalized_value for row in result] == [-4, 104]
    assert all("percent_outside_nominal_range_retained" in row.issues for row in result)


def test_batch_and_endpoint_identity_prevent_heterogeneous_pooling():
    raw = b"compound,value,relation,batch,endpoint\nA,10,=,one,KD\nA,20,=,two,KD\nA,50,=,one,IC50\n"
    value = request(raw).model_copy(
        update={
            "columns": EvidenceColumns(
                compound="compound",
                value="value",
                relation="relation",
                batch="batch",
                endpoint="endpoint",
            )
        }
    )
    assert len(summaries(document(raw, value))) == 3


def test_replicate_identity_and_uncertainty_remain_explicit():
    raw = b"compound,value,relation,repeat,sd\nA,10,=,R1,2\nA,12,=,R1,3\n"
    value = request(raw).model_copy(
        update={
            "columns": EvidenceColumns(
                compound="compound",
                value="value",
                relation="relation",
                replicate="repeat",
                uncertainty="sd",
            )
        }
    )
    with pytest.raises(ValueError, match="replicate"):
        parse_observations(raw, value)
    distinct = raw.replace(b"12,=,R1", b"12,=,R2")
    rows = parse_observations(distinct, value)
    assert rows[0].uncertainty.value == 2 and rows[0].uncertainty.kind == "sd"
    with pytest.raises(ValueError, match="exact"):
        parse_observations(distinct.replace(b"10,=", b"10,>"), value)


def test_row_budget_is_an_error_not_a_silent_truncation():
    raw = b"compound,value,relation\n" + b"A,1,=\n" * 1001
    with pytest.raises(ValueError, match="1000"):
        parse_observations(raw, request(raw))


@pytest.fixture
def records(tmp_path):
    store = Store(tmp_path / "jobs.sqlite3")
    assets = AssetStore(store, tmp_path / "assets")
    raw = b"compound,value,relation\nA,10,=\nA,20,>\n"
    asset = assets.save("reported.csv", "measurements", raw)
    value = request(raw).model_copy(
        update={"source": MoleculeRef(asset_id=asset.id, sha256=asset.sha256)}
    )
    return EvidenceRecords(store, assets), value, asset


def test_sqlite_replay_revision_source_integrity_and_asset_retention(records):
    records, value, asset = records
    key = uuid4()
    first = records.save(value, key)
    assert records.save(value, key) == first
    assert records.get(first.id) == first and len(records.list()) == 1
    with pytest.raises(ConflictError):
        records.save(value.model_copy(update={"name": "changed"}), key)
    revision = records.save(
        value.model_copy(update={"parent_id": first.id, "name": "Reviewed annotation"}), uuid4()
    )
    assert revision.request.parent_id == first.id and records.get(first.id) == first
    with pytest.raises(ValueError, match="experimental evidence"):
        records.assets.delete_unused(asset.id)
    source_path = records.assets.path(asset)
    source_path.write_text("changed original source")
    with pytest.raises(ValueError, match="size changed"):
        records.get(first.id)
    # Equal-size tampering must also fail the content digest, not just file size.
    source_path.write_bytes(b"X" * asset.size)
    with pytest.raises(ValueError, match="integrity"):
        records.get(first.id)


def test_changed_persisted_record_and_unknown_material_link_are_rejected(records):
    records, value, _ = records
    first = records.save(value, uuid4())
    with records.store.connect() as db:
        body = json.loads(
            db.execute(
                "SELECT body FROM research_evidence WHERE id=?", (str(first.id),)
            ).fetchone()[0]
        )
        body["request"]["citation"] = "changed"
        db.execute(
            "UPDATE research_evidence SET body=? WHERE id=?", (json.dumps(body), str(first.id))
        )
    with pytest.raises(ValueError, match="integrity"):
        records.get(first.id)
    with pytest.raises(ValueError, match="exact saved"):
        records.save(value.model_copy(update={"compound_links": {"A": value.source}}), uuid4())
