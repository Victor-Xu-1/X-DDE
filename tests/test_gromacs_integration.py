"""Changed MD dispatch, sampling, native commands and honest backend isolation."""

import importlib
from pathlib import Path
from types import SimpleNamespace

import pytest
from pydantic import ValidationError
from test_simulations import task

from opendde_workbench.capabilities.method_choices import method_choices
from opendde_workbench.engine_registry import engine_for
from opendde_workbench.integrations.backend import ScientificBackend
from opendde_workbench.integrations.specs import PROGRAMS
from opendde_workbench.requests import TASK_ADAPTER
from opendde_workbench.simulations.options import FreeEnergyPayload, GromacsDynamicsPayload


@pytest.fixture
def native(monkeypatch):
    root = Path(__file__).resolve().parents[1] / "src/opendde_workbench"
    monkeypatch.syspath_prepend(str(root / "integrations"))
    monkeypatch.syspath_prepend(str(root / "simulations"))
    # Real numerical parsers run in CI, independently of scientific MD execution.
    return importlib.import_module("native_gromacs_protocol")


def test_gromacs_has_separate_typed_operation_and_preserves_openmm_history(settings):
    original = task().model_dump(mode="json")
    original_bytes = task().payload.model_dump_json()
    value = {
        **original,
        "operation": "gromacs_dynamics",
        "payload": {"kind": "gromacs", "mode": "dynamics"},
    }
    request = TASK_ADAPTER.validate_python(value)
    assert isinstance(request.payload, GromacsDynamicsPayload)
    assert engine_for(request.operation).id == "gromacs"
    assert request.inputs == TASK_ADAPTER.validate_python(original).inputs
    assert request.scientific_inputs == TASK_ADAPTER.validate_python(original).scientific_inputs
    assert TASK_ADAPTER.validate_python(original).payload.model_dump_json() == original_bytes
    wrong = {**value, "operation": "molecular_dynamics"}
    with pytest.raises(ValidationError, match="matching scientific program"):
        TASK_ADAPTER.validate_python(wrong)
    backend = ScientificBackend(settings, "gromacs")
    assert len(backend.files) <= 32
    for name in ("native_gromacs.py", "native_gromacs_files.py", "native_md_outputs.py"):
        assert backend.shared_sources[name].is_file()
    assert backend.container("00000000-0000-4000-8000-000000000001").startswith("xdde-gromacs-")


def test_two_md_methods_share_intent_but_not_runtime_or_default():
    groups = method_choices()
    group = next(g for g in groups if g["id"] == "molecular_dynamics")
    assert group["default"] == "openmm.dynamics"
    assert [o["id"] for o in group["options"]] == ["openmm.dynamics", "gromacs.dynamics"]
    assert PROGRAMS["gromacs"]["version"].startswith("2026.3")
    assert "gromacs=2026.3=nompi_cuda_h39c90b0_0" in PROGRAMS["gromacs"]["conda"]
    assert not PROGRAMS["gromacs"]["models"]


def test_gromacs_rejects_unrepresentable_sampling_before_running():
    with pytest.raises(ValidationError, match="divisible"):
        GromacsDynamicsPayload(production_ns=0.003, frames=101)
    assert GromacsDynamicsPayload(production_ns=0.002, frames=100).frames == 100


def test_openfe_mapper_choice_retains_historical_default_snapshot_bytes():
    default = FreeEnergyPayload(records=[0, 1])
    assert "atom_mapper" not in default.model_dump()
    assert "atom_mapper" not in FreeEnergyPayload(records=[0, 1], atom_mapper="lomap").model_dump()
    assert (
        FreeEnergyPayload(records=[0, 1], atom_mapper="kartograf").model_dump()["atom_mapper"]
        == "kartograf"
    )
    with pytest.raises(ValidationError):
        FreeEnergyPayload(records=[0, 1], atom_mapper="unreviewed")


def test_native_stages_keep_pressure_sampling_and_strict_gpu_selection(native, monkeypatch):
    payload = GromacsDynamicsPayload(production_ns=0.002).model_dump()
    calls = []
    monkeypatch.setattr(native, "command", lambda arguments, **kw: calls.append((arguments, kw)))
    monkeypatch.setattr(native, "Path", lambda *a: SimpleNamespace(write_text=lambda value: None))
    request = {"payload": payload, "options": {"device": "cuda", "cpu": 2}}
    native.stage(
        request, "repeat-1", "production", "repeat-1-nvt.gro", 101, checkpoint="repeat-1-nvt.cpt"
    )
    assert calls[0][0][0] == "grompp" and "-maxwarn" not in calls[0][0]
    assert calls[1][0][:3] == ["mdrun", "-deffnm", "repeat-1"]
    assert calls[1][0][calls[1][0].index("-nb") + 1] == "gpu"
    assert calls[1][0][calls[1][0].index("-pme") + 1] == "gpu"
    assert calls[1][1]["timeout"] == payload["time_limit_seconds"]
    nvt, npt = native.mdp(payload, "equilibrate", 101), native.mdp(payload, "production", 101)
    assert "pcoupl = no" in nvt and "gen-seed = 101" in nvt
    assert "pcoupl = C-rescale" in npt and "continuation = yes" in npt
    assert "nstxout = 10" in npt and "gen-vel = no" in npt


def test_failed_native_command_is_explicit_and_never_retried(native, monkeypatch, tmp_path):
    calls = []
    monkeypatch.setattr(native, "Path", lambda *a: tmp_path / "gromacs.log")

    def failed(args, **kwargs):
        calls.append((args, kwargs))
        return SimpleNamespace(returncode=1)

    monkeypatch.setattr(native.subprocess, "run", failed)
    with pytest.raises(RuntimeError, match="No alternate engine"):
        native.command(["mdrun", "-nb", "gpu"])
    assert len(calls) == 1 and calls[0][0][0] == "gmx"
    assert calls[0][1]["cwd"] == "/output"
    assert not calls[0][1].get("shell", False)


def test_native_energy_preserves_sign_and_rejects_missing_observations(native, tmp_path):
    files = importlib.import_module("native_gromacs_files")
    path = tmp_path / "energy.xvg"
    path.write_text('# native potential\n@ title "Potential"\n0 -8923.5\n1 -9102.25\n')
    rows = files.energy_rows(path)
    assert files.energy_at(rows, 1) == -9102.25
    with pytest.raises(ValueError, match="No native energy"):
        files.energy_at(rows, 0.5)
    path.write_text("0 nan\n")
    with pytest.raises(ValueError, match="invalid"):
        files.energy_rows(path)
