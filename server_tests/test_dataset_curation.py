"""Focused actual chemistry, bounded streaming exports and DEL model reuse."""

import csv
import io
import os

import pytest
from dataset_native_fixture import Native, public_counts, public_del

from opendde_workbench.examples.catalogue import FILES
from opendde_workbench.examples.files import verified_file

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_TEST_DATASET_NATIVE") != "1",
    reason="Actual native algorithms run in scoped CI/server only",
)


def test_native_curation_preserves_real_ranking_and_molecular_filter_evidence(
    tmp_path, monkeypatch
):
    from rdkit import Chem

    native = Native(tmp_path, monkeypatch)
    supplier = Chem.SDMolSupplier()
    supplier.SetData(
        verified_file(tmp_path / "public", FILES["egfr_library"]).decode(), removeHs=False
    )
    members = [
        (100 - index, 0, index, {"smiles": Chem.MolToSmiles(mol, isomericSmiles=True)})
        for index, mol in enumerate(supplier)
        if mol is not None
    ]
    module = native.module("drugclip_candidates")
    chosen, rows = module.selection(members, {"retain": 12}, 101)
    assert chosen == {i for i, row in enumerate(rows) if row["eligible"]} & set(range(12))
    diverse, _ = module.selection(members, {"retain": 12, "shortlist": "diversity"}, 101)
    assert (
        len(diverse) == 12
        and diverse == module.selection(members, {"retain": 12, "shortlist": "diversity"}, 101)[0]
    )
    representatives, values = module.selection(
        members, {"retain": 50, "shortlist": "scaffold"}, 101
    )
    assert len({values[i]["scaffold_group"] for i in representatives}) == len(representatives)
    filtered, evidence = module.selection(
        members,
        {"retain": 50, "candidate_policy": "lead_like", "structural_alerts": "exclude"},
        101,
    )
    assert filtered and all(
        150 <= evidence[i]["descriptors"]["mw"] <= 500
        and -1 <= evidence[i]["descriptors"]["logp"] <= 5
        and not evidence[i]["structural_alerts"]
        for i in filtered
    )
    assert any(row["reason_code"] for row in evidence)


def test_csv_export_writes_records_before_a_later_source_failure(tmp_path, monkeypatch):
    native = Native(tmp_path, monkeypatch)

    def source():
        yield ["=unsafe", 1]
        yield ["valid", 2]
        raise ValueError("source failure after confirmed records")

    with pytest.raises(ValueError, match="source failure"):
        native.io.write_csv("/output/research.csv", ["member", "count"], source())
    rows = list(
        csv.reader(io.StringIO((tmp_path / "output/research.csv").read_text(encoding="utf-8-sig")))
    )
    assert rows == [["member", "count"], ["'=unsafe", "1"], ["valid", "2"]]


def test_pose_complex_preserves_actual_protein_frame_and_ligand_coordinates(tmp_path, monkeypatch):
    import numpy as np
    from rdkit import Chem

    native = Native(tmp_path, monkeypatch)
    original = verified_file(tmp_path / "public", FILES["brd4"]).decode()
    lines = [line for line in original.splitlines() if line.startswith("ATOM  ")]
    receptor = tmp_path / "protein.pdb"
    receptor.write_text("\n".join(lines) + "\nEND\n")
    supplier = Chem.SDMolSupplier()
    supplier.SetData(verified_file(tmp_path / "public", FILES["jq1"]).decode(), removeHs=False)
    molecule = supplier[0]
    coordinates = molecule.GetConformer().GetPositions().copy()
    output = tmp_path / "complex.pdb"
    site = native.module("pose_complex").export(receptor, molecule, output)
    actual = output.read_text().splitlines()
    assert [line for line in actual if line.startswith("ATOM  ")] == lines
    heterogens = [line for line in actual if line.startswith("HETATM")]
    serials = [int(line[6:11]) for line in actual if line.startswith(("ATOM  ", "HETATM"))]
    assert len(serials) == len(set(serials))
    pose = np.asarray(
        [[float(line[start : start + 8]) for start in (30, 38, 46)] for line in heterogens]
    )
    assert np.allclose(pose, coordinates, atol=0.00051) and all(
        line[21] == site["chain"] for line in heterogens
    )
    assert np.array_equal(molecule.GetConformer().GetPositions(), coordinates)


def test_native_model_reuse_keeps_labels_domain_and_independent_validation_distinct(
    tmp_path, monkeypatch
):
    native = Native(tmp_path, monkeypatch)
    with public_del(tmp_path / "public") as archive:
        raw = public_counts(archive, 3000)
    material = native.material(raw, ".csv", "counts")
    samples = [
        {"column": f"corrected_index{i}", "group": "BRD4", "role": "target", "replicate": n + 1}
        for n, i in enumerate((2, 3, 4))
    ]
    samples.append({"column": "corrected_index6", "group": "reference", "role": "reference"})
    request = native.task(
        "del_analyze",
        {
            "kind": "deli",
            "mode": "analyze",
            "samples": samples,
            "cycle_columns": ["ID_A", "ID_B", "ID_C"],
            "comparisons": [
                {"id": "BRD4_vs_reference", "selection": "BRD4", "reference": "reference"}
            ],
        },
        [material],
    )
    native.module("native_del_analysis").run(request.model_dump(mode="json"))
    source = native.capture(request)
    task = native.task(
        "del_model",
        {
            "kind": "deli",
            "mode": "model",
            "chosen_comparison": "BRD4_vs_reference",
            "holdout_cycle": 2,
            "trees": 50,
            "max_training_members": 1000,
        },
        sources=[source],
    )
    native.module("native_del_model").run(task.model_dump(mode="json"))
    result = native.check(task)
    assert result.counts["heldout"] >= 20
    model = native.capture(task)
    apply = native.task(
        "del_model",
        {
            "kind": "deli",
            "mode": "model",
            "model_action": "predict",
            "chosen_comparison": "BRD4_vs_reference",
            "retain": 20,
            "max_prediction_members": 3000,
        },
        sources=[model, source],
    )
    native.module("native_del_predict").run(apply.model_dump(mode="json"))
    predicted = native.check(apply)
    assert predicted.counts["predicted"] + predicted.counts["unresolved_structures"] == 3000
    assert len(predicted.candidates) == 20 and all(
        row.geometry == "none" for row in predicted.candidates
    )
    values = list(
        csv.DictReader((tmp_path / "output/predicted-enrichment.csv").open(encoding="utf-8-sig"))
    )
    assert all(0 <= float(row["nearest_training_reference_tanimoto"]) <= 1 for row in values)
    assert {row["in_training"] for row in values} == {"True", "False"}
    assert predicted.warnings and predicted.metadata["prediction_unit"] == "log1p_enrichment"
