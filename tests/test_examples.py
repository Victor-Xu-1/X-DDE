"""Example provenance/import boundaries; these checks do not simulate scientific results."""

import hashlib
from pathlib import Path

import pytest

from opendde_workbench.assets import AssetStore
from opendde_workbench.capabilities.definitions import CAPABILITIES
from opendde_workbench.examples import preparation
from opendde_workbench.examples.catalogue import FILES, MODULES, POLYMERS
from opendde_workbench.examples.collections import sdf_collection
from opendde_workbench.examples.downloads import DOWNLOADS, PREFIX, download_url
from opendde_workbench.examples.files import verified_file
from opendde_workbench.examples.structure_inputs import protein_only_pdb
from opendde_workbench.research.storage import ScientificStore
from opendde_workbench.store import Store


def test_every_visible_module_has_a_source_backed_complex_case():
    assert set(MODULES) == {key for key, value in CAPABILITIES.items() if value.frontend_form}
    from opendde_workbench.datasets.capabilities import CAPABILITIES as DATA_CAPABILITIES

    assert {item.id for item in DATA_CAPABILITIES} <= set(MODULES)
    assert all(MODULES[item.id].pinned_run_required for item in DATA_CAPABILITIES)
    assert len(POLYMERS["3MXF.polymer-1.json"]["sequence"]) == 127
    assert len(POLYMERS["1N8Z.polymer-2.json"]["sequence"]) == 220
    assert FILES["jq1"].bytes > 3000
    assert FILES["mz1"].bytes > 1_000_000
    assert all(value.url.startswith("https://") for value in FILES.values())


def test_corrupt_or_oversized_pinned_cache_is_rejected_without_network(tmp_path):
    spec = FILES["jq1"]
    (tmp_path / spec.sha256).write_bytes(b"changed" * spec.bytes)
    with pytest.raises(ValueError, match="new example revision"):
        verified_file(tmp_path, spec)


def test_fixed_template_transport_preserves_origin_and_original_checksum(monkeypatch):
    spec = FILES["jq1"]
    assert download_url(spec) == PREFIX + spec.sha256 + ".sdf"
    assert spec.url.startswith("https://models.rcsb.org/")
    assert len(DOWNLOADS) == 13
    monkeypatch.setitem(DOWNLOADS, spec.sha256, "https://unreviewed.invalid/template.sdf")
    with pytest.raises(ValueError, match="not reviewed"):
        download_url(spec)


def test_repeat_import_preserves_versions_and_original_user_assets(tmp_path, monkeypatch):
    store = Store(tmp_path / "jobs.sqlite3")
    assets = AssetStore(store, tmp_path / "assets")
    original = assets.save("original.pdb", "structure", b"HEADER user original\nEND\n")
    scientific = ScientificStore(store, assets)
    # Controlled archive response tests registration, not molecular interpretation.
    payloads = {
        "brd4": b"HEADER public structure\nEND\n",
        "brd4_apo": b"HEADER public apo structure\nEND\n",
        "jq1": b"public molecule input\nM  END\n$$$$\n",
    }
    monkeypatch.setattr(preparation, "verified_file", lambda _, spec: payloads[spec.key])
    first = preparation.prepare_example("p2rank.detect", scientific, tmp_path / "cache")
    repeated = preparation.prepare_example("gnina.dock", scientific, tmp_path / "cache")
    assert first.objects["brd4"].reference == repeated.objects["brd4"].reference
    assert first.objects["jq1"].id == repeated.objects["jq1"].id
    assert assets.path(assets.get(original.id)).read_bytes() == b"HEADER user original\nEND\n"
    assert first.objects["brd4"].validation == "file_integrity_only"
    assert "rcsb.org" in first.objects["brd4"].notes
    assert store.list_jobs() == []


def test_verified_cached_input_retains_the_original_bytes(tmp_path):
    # A bounded byte-integrity check; no upstream model or result is mocked.
    content = b"public archive bytes"
    spec = FILES["jq1"].model_copy(
        update={"bytes": len(content), "sha256": hashlib.sha256(content).hexdigest()}
    )
    Path(tmp_path, spec.sha256).write_bytes(content)
    assert verified_file(tmp_path, spec) == content


def test_fixed_input_reuses_its_exact_asset_after_duplicate_archive_merge(tmp_path, monkeypatch):
    """Identical bytes in another archive do not replace a fixed version's asset UUID."""
    from uuid import uuid4

    store = Store(tmp_path / "jobs.sqlite3")
    assets = AssetStore(store, tmp_path / "assets")
    scientific = ScientificStore(store, assets)
    payloads = {
        "brd4": b"HEADER public structure\nEND\n",
        "brd4_apo": b"HEADER public apo structure\nEND\n",
        "jq1": b"public molecule input\nM  END\n$$$$\n",
    }
    monkeypatch.setattr(preparation, "verified_file", lambda _, spec: payloads[spec.key])
    first = preparation.prepare_example("p2rank.detect", scientific, tmp_path / "cache")
    fixed = first.objects["brd4"].reference
    asset = assets.get(fixed.asset_id)
    duplicate = asset.model_copy(update={"id": str(uuid4())})
    folder = assets.root / duplicate.id
    folder.mkdir()
    (folder / ("content" + duplicate.suffix)).write_bytes(payloads["brd4"])
    with store.connect() as db:
        db.execute(
            "INSERT INTO assets VALUES(?,?,?,?,?,?,?)", tuple(duplicate.model_dump().values())
        )
    save = assets.save
    monkeypatch.setattr(
        assets,
        "save",
        lambda name, kind, content: duplicate if name == asset.name else save(name, kind, content),
    )
    repeated = preparation.prepare_example("gnina.dock", scientific, tmp_path / "cache")
    assert repeated.objects["brd4"].reference == fixed
    assert assets.get(duplicate.id).sha256 == fixed.sha256
    assets.path(asset).write_bytes(b"HEADER changed\nEND\n")
    with pytest.raises(ValueError, match="size changed|input file changed"):
        preparation.prepare_example("p2rank.detect", scientific, tmp_path / "cache")


def test_single_mol_archive_responses_remain_distinct_sdf_records():
    records = [b"drug-a\nM  END\n", b"drug-b\nM  END\n$$$$\n", b"drug-c\nM  END\n"]
    collection = sdf_collection(records)
    assert collection.count(b"$$$$") == 3
    assert [part.strip().splitlines()[0] for part in collection.split(b"$$$$")[:-1]] == [
        b"drug-a",
        b"drug-b",
        b"drug-c",
    ]


def test_protein_template_selection_keeps_deposited_atoms_and_original_input():
    atom = b"ATOM      1  CA  ALA A  12      10.200  20.300  30.400  1.00 15.00           C\n"
    original = (
        atom
        + b"HETATM    2  C1  JQ1 A 201      11.200  20.300  30.400  1.00 15.00           C\nEND\n"
    )
    assert protein_only_pdb(original) == atom + b"END\n"
    assert b"HETATM" in original
