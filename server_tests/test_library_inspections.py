"""Real pinned RDKit inspection, original chemistry and public ABL inhibitor inputs."""

import csv
import hashlib
import importlib.util
import json
import sys
from pathlib import Path
from urllib.request import urlopen
from uuid import uuid4

import pytest

Chem = pytest.importorskip("rdkit.Chem")


@pytest.fixture
def native(monkeypatch):
    folder = Path("src/opendde_workbench/chemistry").resolve()
    monkeypatch.syspath_prepend(str(folder))
    modules = {}
    for name in ("screen_options", "screen_io", "native_screen"):
        spec = importlib.util.spec_from_file_location(name, folder / (name + ".py"))
        module = importlib.util.module_from_spec(spec)
        monkeypatch.setitem(sys.modules, name, module)
        spec.loader.exec_module(module)
        modules[name] = module
    return modules


def run_native(native, tmp_path, molecules, **choices):
    assets = tmp_path / "assets"
    assets.mkdir(exist_ok=True)
    file = assets / "library.sdf"
    with Chem.SDWriter(str(file)) as writer:
        for molecule in molecules:
            writer.write(molecule)
    original = file.read_bytes()
    library = {"asset_id": str(uuid4()), "sha256": hashlib.sha256(original).hexdigest()}
    output = tmp_path / str(uuid4())
    output.mkdir()
    result = native["native_screen"].run_screen(
        {
            "library": library,
            "query": None,
            "options": native["screen_options"].ScreenOptions(**choices).model_dump(mode="json"),
        },
        {library["asset_id"]: "/job/assets/library.sdf"},
        tmp_path,
        output,
    )
    assert file.read_bytes() == original
    return result, output, file


def test_real_pains_control_is_warned_and_excluded_only_on_request(native, tmp_path):
    # Positive chemical-method control from RDKit's FilterCatalog documentation;
    # it is not presented as a therapeutic drug or an experimental toxicity result.
    control = Chem.MolFromSmiles("O=C(Cn1cnc2c1c(=O)n(C)c(=O)n2C)N/N=C/c1c(O)ccc2c1cccc2")
    for policy in ("warn", "exclude"):
        result, output, _ = run_native(
            native,
            tmp_path,
            [control],
            mode="alerts",
            alert_policy=policy,
            alert_catalogue="pains",
        )
        row = result["rows"][0]
        assert row["structural_alerts"] and all(
            alert["catalogue"] == "PAINS" for alert in row["structural_alerts"]
        )
        assert row["selected"] == (policy == "warn")
        assert (row["reason_code"] == "structural_alert") == (policy == "exclude")
        with (output / result["report_artifact"]).open(encoding="utf-8-sig") as stream:
            rows = list(csv.DictReader(stream))
        assert len(rows) == 1 and "PAINS:" in rows[0]["Structural alerts"]
        assert (
            hashlib.sha256((output / result["report_artifact"]).read_bytes()).hexdigest()
            == result["report_sha256"]
        )


def test_scaffold_balance_quota_acyclic_identity_and_fragment_limits(native, tmp_path):
    molecules = [
        Chem.MolFromSmiles(smiles)
        for smiles in (
            "c1ccccc1",
            "Cc1ccccc1",
            "c1ncccc1",
            "C1CCCCC1",
            "CCCC",
            "CCCCC",
            "[Na+].[Cl-]",
        )
    ]
    result, _, _ = run_native(native, tmp_path, molecules, mode="scaffold", max_selected=6)
    assert result["selected_records"] == [0, 2, 3, 4, 5]
    assert result["rows"][1]["reason_code"] == "scaffold_quota"
    assert (
        result["rows"][6]["available"] and result["rows"][6]["reason_code"] == "multiple_fragments"
    )
    assert result["rows"][4]["scaffold_group"] != result["rows"][5]["scaffold_group"]
    again, _, _ = run_native(
        native, tmp_path, molecules, mode="scaffold", max_selected=6, per_scaffold=2
    )
    assert again["selected_records"] == [0, 2, 3, 4, 5, 1]
    limited, _, _ = run_native(native, tmp_path, molecules, mode="scaffold", max_selected=2)
    assert (
        limited["selected_records"] == [0, 2]
        and limited["rows"][3]["reason_code"] == "count_budget"
    )


def test_stereochemistry_isotope_charge_properties_and_coordinates_survive(native, tmp_path):
    from rdkit.Chem import rdDepictor

    molecule = Chem.MolFromSmiles("[13CH3][C@H](F)C(=O)[O-]")
    molecule.SetProp("SOURCE_NOTE", "original scientific record")
    rdDepictor.Compute2DCoords(molecule)
    result, output, source = run_native(native, tmp_path, [molecule], mode="scaffold")
    before = list(Chem.SDMolSupplier(str(source), removeHs=False))[0]
    after = list(Chem.SDMolSupplier(str(output / "selected.sdf"), removeHs=False))[0]
    assert Chem.MolToSmiles(before, isomericSmiles=True) == Chem.MolToSmiles(
        after, isomericSmiles=True
    )
    assert after.GetProp("SOURCE_NOTE") == "original scientific record"
    for index in range(before.GetNumAtoms()):
        point = before.GetConformer().GetAtomPosition(index)
        other = after.GetConformer().GetAtomPosition(index)
        assert (point.x, point.y, point.z) == pytest.approx((other.x, other.y, other.z), abs=0.0001)
    assert result["rows"][0]["structural_alerts"] is None


def test_real_three_drug_library_has_checked_public_sources_and_reusable_native_outputs(
    native, tmp_path
):
    manifest = json.loads(Path("src/opendde_workbench/examples/catalogue.json").read_text())
    blocks, source_records = [], []
    for key in ("imatinib", "dasatinib", "nilotinib"):
        source = manifest["files"][key]
        with urlopen(source["url"], timeout=30) as response:
            raw = response.read(source["bytes"] + 1)
        assert len(raw) == source["bytes"] and hashlib.sha256(raw).hexdigest() == source["sha256"]
        block = raw.rstrip()
        # Preserve a blank field terminator before the missing record separator.
        blocks.append(block + (b"\n" if block.endswith(b"$$$$") else b"\n\n$$$$\n"))
        source_records.append(source)
    evidence = Path("server_tests/evidence/library-inputs")
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / "abl-inhibitors.sdf").write_bytes(b"".join(blocks))
    (evidence / "sources.json").write_text(json.dumps(source_records, indent=2))
    molecules = list(Chem.SDMolSupplier(str(evidence / "abl-inhibitors.sdf"), removeHs=False))
    assert len(molecules) == 3 and all(molecule.GetNumHeavyAtoms() > 30 for molecule in molecules)
    for mode, policy in (("alerts", "warn"), ("scaffold", "off")):
        result, output, file = run_native(
            native, tmp_path, molecules, mode=mode, alert_policy=policy
        )
        assert len(result["rows"]) == 3 and all(row["available"] for row in result["rows"])
        assert result["selected_records"] == [0, 1, 2]
        target = Path("server_tests/evidence/library-methods") / mode
        target.mkdir(parents=True, exist_ok=True)
        (target / "result.json").write_text(json.dumps(result, indent=2))
        (target / "input.sdf").write_bytes(file.read_bytes())
        for name in ("selected.sdf", "library-report.csv"):
            (target / name).write_bytes((output / name).read_bytes())
