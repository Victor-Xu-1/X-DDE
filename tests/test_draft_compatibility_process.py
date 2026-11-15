"""Controlled schema normalization and child failures; no scientific processes."""

import json
import os
import subprocess
import sys
from types import SimpleNamespace

import pytest

from opendde_workbench.drafts.compatibility_probe import validate_row
from opendde_workbench.drafts.compatibility_process import run_probe


@pytest.mark.parametrize("mutation", ["drop", "coerce"])
def test_in_place_target_normalization_cannot_change_its_comparison_baseline(mutation):
    body = {
        "tool": "predict",
        "schema_version": 1,
        "state": {
            "name": "retained study",
            "components": [{"count": "2", "source": {"id": "retained"}}],
        },
    }
    row = {
        "id": "draft",
        "revision": 1,
        "body": json.dumps(body),
        "created_at": "now",
        "updated_at": "now",
        "archived": False,
    }

    def mutating_validator(envelope):
        component = envelope["state"]["components"][0]
        if mutation == "drop":
            component.pop("source")
        else:
            component["count"] = 2
        return SimpleNamespace(state=SimpleNamespace(model_dump=lambda **_: envelope["state"]))

    with pytest.raises(ValueError, match="changed stored research input"):
        validate_row(row, mutating_validator)
    assert json.loads(row["body"]) == body


def test_probe_collects_both_real_pipes_and_returns_only_the_report():
    arguments = [
        sys.executable,
        "-u",
        "-c",
        "import sys; print('report'); print('private diagnostic', file=sys.stderr)",
    ]
    assert run_probe(arguments, stdin=subprocess.DEVNULL) == b"report\n"


@pytest.mark.parametrize("stream", ["stdout", "stderr"])
def test_noisy_child_is_terminated_at_each_stream_limit(tmp_path, stream):
    pid_file = tmp_path / "child-pid"
    arguments = [
        sys.executable,
        "-u",
        "-c",
        "import os,sys,time; from pathlib import Path; "
        "Path(sys.argv[1]).write_text(str(os.getpid())); "
        f"sys.{stream}.buffer.write(b'x'*200000); sys.{stream}.flush(); time.sleep(30)",
        str(pid_file),
    ]
    with pytest.raises(ValueError, match="output budget") as failure:
        run_probe(arguments, stdin=subprocess.DEVNULL, timeout=5)
    assert "xxxx" not in str(failure.value)
    with pytest.raises(ProcessLookupError):
        os.kill(int(pid_file.read_text()), 0)


@pytest.mark.parametrize("close_pipes", [False, True])
def test_deadline_also_terminates_a_child_that_closes_both_pipes(tmp_path, close_pipes):
    pid_file = tmp_path / "child-pid"
    close = "os.close(1); os.close(2); " if close_pipes else ""
    arguments = [
        sys.executable,
        "-u",
        "-c",
        "import os,sys,time; from pathlib import Path; "
        "Path(sys.argv[1]).write_text(str(os.getpid())); " + close + "time.sleep(30)",
        str(pid_file),
    ]
    with pytest.raises(subprocess.TimeoutExpired):
        run_probe(arguments, stdin=subprocess.DEVNULL, timeout=1)
    with pytest.raises(ProcessLookupError):
        os.kill(int(pid_file.read_text()), 0)


def test_failed_target_diagnostics_are_not_attached_to_failure():
    arguments = [
        sys.executable,
        "-u",
        "-c",
        "import sys; print('PRIVATE_INPUT', file=sys.stderr); sys.exit(7)",
    ]
    with pytest.raises(subprocess.CalledProcessError) as failure:
        run_probe(arguments, stdin=subprocess.DEVNULL)
    assert failure.value.returncode == 7
    assert failure.value.output is None and failure.value.stderr is None
