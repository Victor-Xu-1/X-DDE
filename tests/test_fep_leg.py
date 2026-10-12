"""Separate native leg processes retain deadlines, failures and original plans."""

import importlib
import json
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest


@pytest.fixture
def leg(monkeypatch):
    root = Path(__file__).parents[1] / "src/opendde_workbench/simulations"
    monkeypatch.syspath_prepend(str(root))
    return importlib.import_module("native_fep_leg")


def test_each_native_leg_has_an_independent_process_and_unchanged_plan(tmp_path, monkeypatch, leg):
    calls = []

    def process(arguments, **kwargs):
        calls.append((arguments, kwargs))
        Path(arguments[-1]).write_text(json.dumps({"native_leg": Path(arguments[3]).name}))
        return SimpleNamespace(returncode=0)

    monkeypatch.setattr(leg.subprocess, "run", process)
    for kind in ("solvent", "complex"):
        plan = tmp_path / (kind + "-plan.json")
        original = b"Immutable native transformation"
        plan.write_bytes(original)
        work = tmp_path / kind
        work.mkdir()
        assert leg.execute_leg(plan, work, tmp_path / (kind + ".json"), 120) == {"native_leg": kind}
        assert plan.read_bytes() == original
    assert len(calls) == 2
    for arguments, options in calls:
        assert arguments[:2] == [sys.executable, "-B"]
        assert options == {"check": True, "timeout": 120}
        assert Path(arguments[2]).name == "native_fep_leg.py"


def test_failed_native_leg_never_returns_a_preexisting_summary(tmp_path, monkeypatch, leg):
    (tmp_path / "leg-summary.json").write_text('{"stale":true}')

    def failure(arguments, **kwargs):
        raise subprocess.CalledProcessError(1, arguments)

    monkeypatch.setattr(leg.subprocess, "run", failure)
    with pytest.raises(subprocess.CalledProcessError):
        leg.execute_leg(tmp_path / "plan.json", tmp_path, tmp_path / "result.json", 120)


@pytest.mark.parametrize("timeout", [0, -1, True, 604801, float("inf")])
def test_unbounded_or_expired_deadlines_never_launch_a_leg(tmp_path, monkeypatch, leg, timeout):
    monkeypatch.setattr(leg.subprocess, "run", lambda *a, **k: pytest.fail("Native launch"))
    with pytest.raises(ValueError, match="deadline"):
        leg.execute_leg(tmp_path / "plan.json", tmp_path, tmp_path / "result.json", timeout)
