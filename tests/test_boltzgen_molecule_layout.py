"""Reproduce flat official-archive layout through the real native command bridge."""

import hashlib
import importlib
import json
import zipfile
from pathlib import Path

import pytest

from opendde_workbench.deployment.scientific_install import model_archive
from opendde_workbench.integrations.native_resources import (
    PROTEIN_COMPONENTS,
    model_files,
    protein_molecule_directory,
)


def library(tmp_path):
    archive = tmp_path / "mols.zip"
    with zipfile.ZipFile(archive, "w") as package:
        for residue in PROTEIN_COMPONENTS:
            package.writestr(residue + ".pkl", b"sealed CCD layout fixture, never deserialized")
    model_archive(archive, tmp_path, lambda: None)
    resource = {
        "name": archive.name,
        "sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
        "size": archive.stat().st_size,
    }
    spec = {"name": "BoltzGen", "models": [resource]}
    manifest = {
        "recipe_sha256": hashlib.sha256(
            json.dumps(spec, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest(),
        "files": [
            {
                "name": file.name,
                "sha256": hashlib.sha256(file.read_bytes()).hexdigest(),
                "size": file.stat().st_size,
            }
            for file in sorted(tmp_path.iterdir())
        ],
    }
    (tmp_path / "manifest.json").write_text(json.dumps(manifest))
    return spec


def test_flat_archive_readiness_and_missing_extracted_component_fail_closed(tmp_path):
    spec = library(tmp_path)
    assert not (tmp_path / "mols").exists()
    assert protein_molecule_directory(tmp_path) == tmp_path
    assert model_files(tmp_path, spec, full_hash=True)
    # Even an archive receipt alone cannot make an incomplete extracted library ready.
    manifest = json.loads((tmp_path / "manifest.json").read_text())
    manifest["files"] = [row for row in manifest["files"] if row["name"] != "ALA.pkl"]
    (tmp_path / "manifest.json").write_text(json.dumps(manifest))
    (tmp_path / "ALA.pkl").unlink()
    with pytest.raises(ValueError, match="canonical component"):
        model_files(tmp_path, spec)


@pytest.mark.parametrize("modality", ["protein", "peptide"])
@pytest.mark.parametrize("continuation", [False, True])
def test_native_dispatch_points_to_the_actual_verified_flat_library(
    tmp_path, monkeypatch, modality, continuation
):
    root = Path(__file__).resolve().parents[1] / "src/opendde_workbench/integrations"
    monkeypatch.syspath_prepend(str(root))
    native = importlib.import_module("native_boltzgen")
    models = tmp_path / "models"
    models.mkdir()
    library(models)
    output = tmp_path / "output"
    output.mkdir()
    pdb = tmp_path / "exact-input.pdb"
    pdb.write_text("REMARK sealed dispatch fixture; no protein inference\nEND\n")
    monkeypatch.setattr(native, "input_file", lambda *args: (pdb, None))
    monkeypatch.setattr(
        native, "Path", lambda value: models if value == "/models" else output / "native"
    )
    restored = []
    if continuation:
        import sys
        from types import SimpleNamespace

        monkeypatch.setitem(
            sys.modules,
            "native_binder_checkpoint",
            SimpleNamespace(
                restore_bound_checkpoint=lambda request, target: restored.append(target)
            ),
        )
    captured = []

    class NativeInvocationReached(Exception):
        pass

    def dispatch(arguments):
        captured.extend(map(str, arguments))
        # Match the upstream CLI's required path existence, before any model work.
        assert Path(captured[captured.index("--moldir") + 1]).is_dir()
        raise NativeInvocationReached

    monkeypatch.setattr(native, "execute", dispatch)
    with pytest.raises(NativeInvocationReached):
        native.run(
            {
                "payload": {
                    "target_chains": ["A"],
                    "modality": modality,
                    "length": [70, 90],
                    "candidates": 4,
                    "retain": 2,
                    **(
                        {"continuation": {"job_id": "stopped-source", "sha256": "a" * 64}}
                        if continuation
                        else {}
                    ),
                }
            }
        )
    assert captured[captured.index("--moldir") + 1] == str(models)
    assert captured[captured.index("--num_designs") + 1] == "4"
    assert captured[captured.index("--budget") + 1] == "2"
    assert captured[captured.index("--devices") + 1] == "1"
    assert captured[captured.index("--num_workers") + 1] == "0"
    assert captured[captured.index("--diffusion_batch_size") + 1] == "1"
    # The locked upstream CLI has no sampling-seed option. Do not invent one.
    assert "--seed" not in captured
    assert captured[captured.index("--use_kernels") + 1] == "false"
    assert captured[captured.index("--protocol") + 1] == modality + "-anything"
    assert ("--reuse" in captured) is continuation
    assert restored == ([output / "native/designs"] if continuation else [])
    import yaml

    specification = yaml.safe_load((output / "native/design.yaml").read_text())
    assert specification["entities"][0]["protein"] == {"id": "Z", "sequence": "70..90"}
    assert specification["entities"][1]["file"]["include"] == [{"chain": {"id": "A"}}]
