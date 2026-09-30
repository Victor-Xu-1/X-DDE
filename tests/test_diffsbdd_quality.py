"""Typed result boundary, actual files/SQLite and diagnostic handoff protection."""

import hashlib
import json
from uuid import uuid4

import pytest
from pydantic import ValidationError
from test_diffsbdd_contract import design

from opendde_workbench.assets import AssetStore
from opendde_workbench.diffsbdd.quality import CoreVerification, validate_verification
from opendde_workbench.diffsbdd.snapshot import FILES, capture
from opendde_workbench.requests import TASK_ADAPTER
from opendde_workbench.research.outputs import OutputCatalog
from opendde_workbench.store import Store
from opendde_workbench.task_io import successful


def fixture_result(tmp_path):
    store = Store(tmp_path / "jobs.sqlite3")
    assets = AssetStore(store, tmp_path / "assets")
    body = design("inpaint")
    protein = assets.save("receptor.pdb", "structure", b"controlled receptor file\n")
    ligand = assets.save("initial.sdf", "ligand", b"controlled molecular record\n$$$$\n")
    protein_ref = {"asset_id": protein.id, "sha256": protein.sha256}
    ligand_ref = {"asset_id": ligand.id, "sha256": ligand.sha256}
    body["payload"]["protein"] = protein_ref
    body["payload"]["pocket"]["residues"][0]["structure"] = protein_ref
    body["payload"]["initial"] = ligand_ref
    for atom in body["payload"]["fixed_atoms"]:
        atom["molecule"] = ligand_ref
    request = TASK_ADAPTER.validate_python(body)
    job = store.create(request, str(uuid4()), 20, 100)
    directory = tmp_path / "jobs" / job.id
    output = directory / "output"
    (output / "native").mkdir(parents=True)
    raw = output / "native/molecules.sdf"
    raw.write_text("accepted-parser-fixture\n$$$$\nrejected-parser-fixture\n$$$$\n")
    qualified = output / "qualified-molecules.sdf"
    qualified.write_text("accepted-parser-fixture\n$$$$\n")
    (output / "diagnostic-core-002.sdf").write_text("rejected-parser-fixture\n$$$$\n")
    row = {
        "method": "rdkit_fixed_core_v1",
        "status": "passed",
        "reason": None,
        "preserve_bonds": True,
        "tolerance_angstrom": 0.5,
        "unit": "angstrom",
        "search_states": 3,
        "mapping": [{"source_atom": i, "output_atom": i} for i in [0, 1]],
        "maximum_displacement": 0.1,
        "record": 0,
        "qualified_record": 0,
        "diagnostic_artifact": None,
    }
    rejected = {
        **row,
        "record": 1,
        "qualified_record": None,
        "status": "failed",
        "reason": "no_core_mapping",
        "mapping": [],
        "maximum_displacement": None,
        "diagnostic_artifact": "diagnostic-core-002.sdf",
    }
    evidence = {
        "schema_version": 1,
        "method": "rdkit_fixed_core_v1",
        "source": request.payload.initial.model_dump(mode="json"),
        "fixed_atoms": [0, 1],
        "preserve_bonds": True,
        "raw_artifact": "native/molecules.sdf",
        "raw_sha256": hashlib.sha256(raw.read_bytes()).hexdigest(),
        "qualified_artifact": qualified.name,
        "qualified_sha256": hashlib.sha256(qualified.read_bytes()).hexdigest(),
        "qualified_count": 1,
        "candidates": [row, rejected],
    }
    result = {
        "operation": "diffsbdd",
        "complete": True,
        "mode": "inpaint",
        "valid": 1,
        "native_valid": 2,
        "molecule_artifact": qualified.name,
        "core_verification": evidence,
    }
    (output / "result.json").write_text(json.dumps(result))
    return store, assets, job, output, result


def test_typed_core_manifest_input_digest_and_success_boundary(tmp_path):
    store, assets, job, output, result = fixture_result(tmp_path)
    report = validate_verification(result, job.request, output)
    assert report.qualified_count == 1
    assert successful(job, output.parent, 0)
    assert not successful(job, output.parent, 1)
    result["core_verification"]["source"]["sha256"] = "b" * 64
    with pytest.raises(ValueError, match="immutable"):
        validate_verification(result, job.request, output)
    result["core_verification"]["source"] = job.request.payload.initial.model_dump(mode="json")
    (output / "qualified-molecules.sdf").write_text("changed")
    with pytest.raises(ValueError, match="changed"):
        validate_verification(result, job.request, output)


def test_raw_and_diagnostic_assets_cannot_bypass_shared_qualification(tmp_path):
    store, assets, job, output, result = fixture_result(tmp_path)
    catalog = OutputCatalog(store, assets)
    for name in ("native/molecules.sdf", "diagnostic-core-002.sdf"):
        with pytest.raises(ValueError, match="qualified"):
            catalog.preserve(job.id, output / name, "ligand")
    disguised = output / "native/qualified-molecules.sdf"
    disguised.write_text("unqualified disguised record\n$$$$\n")
    with pytest.raises(ValueError, match="qualified"):
        catalog.preserve(job.id, disguised, "ligand")
    disguised.unlink()
    indexed = catalog.index(job, output)
    assert indexed["state"] == "complete"
    objects = catalog.scientific.list()
    molecules = [v for v in objects if v.kind == "molecule"]
    assert (
        len(molecules) == 1
        and molecules[0].reference.sha256 == result["core_verification"]["qualified_sha256"]
    )
    assert catalog.index(job, output)["state"] == "complete"
    assert len([v for v in catalog.scientific.list() if v.kind == "molecule"]) == 1
    # Existing persisted history is not rewritten or retroactively certified.
    assert Store(store.path).get(job.id).request == job.request


def test_core_contract_rejects_forged_partial_mapping_and_qualification(tmp_path):
    _, _, job, output, result = fixture_result(tmp_path)
    evidence = result["core_verification"]
    for field, value in [
        ("qualified_count", 2),
        ("fixed_atoms", [0, 0]),
        ("qualified_artifact", "native/molecules.sdf"),
    ]:
        changed = {**evidence, field: value}
        with pytest.raises(ValidationError):
            CoreVerification.model_validate(changed)
    row = evidence["candidates"][0]
    for change in [
        {"mapping": row["mapping"][:1]},
        {"mapping": [{"source_atom": 0, "output_atom": 0}, {"source_atom": 1, "output_atom": 0}]},
        {"status": "failed"},
        {"maximum_displacement": float("nan")},
    ]:
        with pytest.raises(ValidationError):
            CoreVerification.model_validate(
                {**evidence, "candidates": [{**row, **change}, evidence["candidates"][1]]}
            )
    (output.parent / "execution.json").write_text(
        json.dumps({"core_verification": "rdkit_fixed_core_v1"})
    )
    result.pop("core_verification")
    (output / "result.json").write_text(json.dumps(result))
    with pytest.raises(KeyError):
        successful(job, output.parent, 0)
    catalog = OutputCatalog(
        Store(tmp_path / "jobs.sqlite3"),
        AssetStore(Store(tmp_path / "jobs.sqlite3"), tmp_path / "assets"),
    )
    with pytest.raises(ValueError, match="missing"):
        catalog.preserve(job.id, output / "native/molecules.sdf", "ligand")


def test_diff_adapter_freezes_exact_bounded_entry_point(tmp_path):
    runner, digests = capture(tmp_path)
    assert runner.parent == tmp_path / "adapter"
    assert set(digests) == set(FILES)
    for name, checksum in digests.items():
        file = runner.parent / name
        assert hashlib.sha256(file.read_bytes()).hexdigest() == checksum
        assert not file.stat().st_mode & 0o222
    with pytest.raises(FileExistsError):
        capture(tmp_path)
