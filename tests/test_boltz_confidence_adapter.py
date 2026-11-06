"""Collector contract only: no Boltz installation, inference or environment changes."""

import importlib.util
import json
import shutil
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest


@pytest.mark.parametrize("retain_arrays", [False, True])
def test_adapter_keeps_exact_ranked_sidecars_and_declares_only_real_outputs(
    tmp_path, monkeypatch, retain_arrays
):
    sources = Path(__file__).parents[1] / "src/opendde_workbench/integrations"
    io_spec = importlib.util.spec_from_file_location(
        "collector_native_io", sources / "native_io.py"
    )
    io_module = importlib.util.module_from_spec(io_spec)
    io_spec.loader.exec_module(io_module)
    monkeypatch.setitem(sys.modules, "native_io", io_module)
    monkeypatch.setitem(
        sys.modules, "native_boltz_inputs", SimpleNamespace(protein_msa=lambda *args: "empty")
    )
    spec = importlib.util.spec_from_file_location(
        "boltz_collector_fixture", sources / "native_boltz.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setitem(
        sys.modules, "yaml", SimpleNamespace(safe_dump=lambda *args, **kwargs: "fixture")
    )
    monkeypatch.setitem(sys.modules, "rdkit", SimpleNamespace(Chem=object()))
    output = tmp_path / "output"
    output.mkdir()
    monkeypatch.setattr(
        module,
        "Path",
        lambda value: output / "native" if value == "/output/native" else Path(value),
    )
    monkeypatch.setattr(module, "protein_msa", lambda *args: "empty")
    monkeypatch.setattr(module, "version", lambda name: "2.2.1")
    called = []
    native_bytes = {}

    def execute(command):
        called.append([str(value) for value in command])
        raw = output / "native/boltz_results_prediction/predictions/prediction"
        raw.mkdir(parents=True)
        processed = output / "native/boltz_results_prediction/processed/structures/prediction.npz"
        processed.parent.mkdir(parents=True)
        processed.write_bytes(b"unchanged processed table fixture")
        for rank in (1, 0):
            (raw / f"prediction_model_{rank}.cif").write_text(f"rank {rank}")
            (raw / f"confidence_prediction_model_{rank}.json").write_text(
                json.dumps({"complex_plddt": 0.8})
            )
            if retain_arrays:
                for field in ("pae", "pde", "plddt"):
                    path = raw / f"{field}_prediction_model_{rank}.npz"
                    native_bytes[path.name] = f"{field} rank {rank} unchanged bytes".encode()
                    path.write_bytes(native_bytes[path.name])

    def copy(source, name):
        shutil.copyfile(source, output / name)
        return name

    finished = []
    monkeypatch.setattr(module, "execute", execute)
    monkeypatch.setattr(module, "copy_artifact", copy)
    monkeypatch.setattr(module, "csv_file", lambda *args: None)
    monkeypatch.setattr(module, "finish", lambda *args, **kwargs: finished.append(kwargs))
    module.run(
        {
            "payload": {
                "components": [{"id": "A", "kind": "protein", "value": "ACDE"}],
                "affinity": False,
                "samples": 2,
                "recycling_steps": 3,
                "sampling_steps": 200,
            },
            "options": {"seed": 101},
        }
    )
    assert "--write_full_pae" in called[0] and "--write_full_pde" in called[0]
    evidence = finished[0]["boltz"]
    assert evidence["mapping_artifact"] == "boltz-processed-structure.npz"
    assert [row["native_rank"] for row in evidence["samples"]] == [0, 1]
    for sample in evidence["samples"]:
        for field in ("pae", "pde", "plddt"):
            if retain_arrays:
                assert (output / sample[field + "_artifact"]).read_bytes() == native_bytes[
                    f"{field}_prediction_model_{sample['native_rank']}.npz"
                ]
            else:
                assert field + "_artifact" not in sample
