"""Real DockQ/Biopython runtime controls; these are not accepted drug-research examples."""

import hashlib
import json
import os
import shutil
from copy import deepcopy
from pathlib import Path
from uuid import uuid4

import numpy as np
import pytest
from comparison_api_harness import verify_api
from comparison_native_harness import execution, run_native

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_TEST_NATIVE_COMPARISON") != "1",
    reason="explicit isolated native-runtime gate only",
)


def test_native_interface_runtime_preserves_PTR_and_only_fits_the_target(tmp_path, monkeypatch):
    from opendde_workbench.deployment.installers import install
    from opendde_workbench.receptors.image import build_lock_digest, labels_match
    from opendde_workbench.scientific_objects import MoleculeRef
    from opendde_workbench.structure_comparison.contract import StructureComparisonTask
    from opendde_workbench.structure_comparison.native_export import write_compared_model
    from opendde_workbench.structure_comparison.native_polymer import selected_polymer
    from opendde_workbench.structure_comparison.validation import validate_comparison

    evidence = Path("server_tests/evidence/structure-comparison")
    evidence.mkdir(parents=True, exist_ok=True)
    try:
        runtime = install(
            "biopython", tmp_path / "components", {}, str(uuid4()), lambda line: None, lambda: None
        )
    finally:
        for index, log in enumerate((tmp_path / "components/operations").glob("*/install.log")):
            shutil.copyfile(log, evidence / f"runtime-build-{index}.log")
    labels = json.loads(
        execution(
            ["docker", "image", "inspect", "--format", "{{json .Config.Labels}}", runtime["image"]],
            directory=tmp_path,
        )
    )
    assert labels_match(labels) and runtime["build_lock_sha256"] == build_lock_digest()
    folder = Path("src/opendde_workbench/receptors").resolve()
    monkeypatch.syspath_prepend(str(folder))
    from native_io import read_model
    from selection import MemberSelection

    source = folder.parent / "examples/stat6/inputs/4Y5U.cif"
    source_sha = hashlib.sha256(source.read_bytes()).hexdigest()
    assert source_sha == "e4a6ffaa490671b76ff5e7aa475a6011fdc0bb8889314a9c4ed92a8c49c03fdb"
    original = MoleculeRef(asset_id=uuid4(), sha256=source_sha)
    options = {
        "target_mapping": [{"reference": "A", "moving": "A"}],
        "partner_mapping": [{"reference": "B", "moving": "B"}],
        "correspondence": "author_numbering",
    }
    request = StructureComparisonTask(
        reference=original, moving=original, options=options, scientific_inputs=[original, original]
    )
    identical = run_native(tmp_path, runtime["image"], request, {str(original.asset_id): source})
    validate_comparison(identical.value, request, identical.output)
    assert identical.value["geometry"]["partner_rmsd_angstrom"] < 1e-6
    metric = identical.value["native_quality"]["interfaces"][0]["metrics"]
    assert metric["DockQ"] == pytest.approx(1, abs=1e-8)
    assert identical.value["native_quality"]["quality_grade"] is None
    for inspection in identical.value["inspections"]:
        assert inspection["polymer"]["polymer_residues"] == 883
        assert len(inspection["polymer"]["modified_residues"]) == 2
    moved, _ = read_model(source, MemberSelection(chains=("A", "B")))
    moved, _, metadata = selected_polymer(source, moved)
    for atom in moved["B"].get_atoms():
        atom.set_coord(atom.coord + np.array([0.0, 0.0, 8.0]))
    fixture = tmp_path / "geometric-control-not-a-prediction.cif"
    write_compared_model(moved, metadata["modified_residues"], fixture)
    comparison = MoleculeRef(
        asset_id=uuid4(), sha256=hashlib.sha256(fixture.read_bytes()).hexdigest()
    )
    negative = run_native(
        tmp_path,
        runtime["image"],
        StructureComparisonTask(
            reference=original,
            moving=comparison,
            options=options,
            scientific_inputs=[original, comparison],
        ),
        {str(original.asset_id): source, str(comparison.asset_id): fixture},
    )
    negative_request = StructureComparisonTask(
        reference=original,
        moving=comparison,
        options=options,
        scientific_inputs=[original, comparison],
    )
    validate_comparison(negative.value, negative_request, negative.output)
    assert negative.value["geometry"]["target_rmsd_angstrom"] < 1e-5
    assert negative.value["geometry"]["partner_rmsd_angstrom"] == pytest.approx(8, abs=0.001)
    assert negative.value["native_quality"]["interfaces"][0]["metrics"]["DockQ"] < metric["DockQ"]
    assert hashlib.sha256(source.read_bytes()).hexdigest() == source_sha
    for key in ("partner_rmsd_angstrom", "target_rmsd_angstrom"):
        corrupt = deepcopy(negative.value)
        corrupt["geometry"][key] += 0.25
        with pytest.raises(ValueError, match="RMSD differs"):
            validate_comparison(corrupt, negative_request, negative.output)
    corrupt = deepcopy(negative.value)
    corrupt["native_quality"]["interfaces"][0]["metrics"]["DockQ"] = 1
    with pytest.raises(ValueError, match="scores differ"):
        validate_comparison(corrupt, negative_request, negative.output)
    table = negative.output / "residue-displacements.csv"
    raw = table.read_bytes()
    table.write_bytes(raw.replace(b"target,A,", b"target,Z,", 1))
    corrupt = deepcopy(negative.value)
    corrupt["artifact_sha256"][table.name] = hashlib.sha256(table.read_bytes()).hexdigest()
    with pytest.raises(ValueError, match="residue identities differ"):
        validate_comparison(corrupt, negative_request, negative.output)
    table.write_bytes(raw)
    for label, control in (("identity-control", identical), ("shifted-partner-control", negative)):
        shutil.copytree(control.output, evidence / label)
    verify_api(tmp_path, runtime["image"], source, fixture, options, evidence)
    (evidence / "runtime-controls.json").write_text(
        json.dumps(
            {
                "native_runtime": runtime,
                "source_sha256": source_sha,
                "positive_control": metric,
                "negative_control": negative.value["geometry"]["partner_rmsd_angstrom"],
                "retained_source_PTR": True,
                "typed_report_and_downloads_verified": True,
                "purpose": "geometric_runtime_controls_not_drug_research",
                "accepted_module_example": False,
                "scientific_model_or_MD_FEP_run": False,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
