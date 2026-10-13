"""pH-labelled native outputs must actually request pH-dependent titration states."""

import importlib.util
import sys
import types
from pathlib import Path

import pytest


@pytest.mark.parametrize("ph", [6.0, 7.4, 8.0])
def test_apbs_preparation_explicitly_enables_propka_for_the_selected_ph(tmp_path, monkeypatch, ph):
    source = tmp_path / "protein.pdb"
    source.write_text("ATOM      1  N   ALA A 180\n")
    calls = []

    class CommandObserved(Exception):
        pass

    def execute(command, **kwargs):
        calls.append(command)
        raise CommandObserved

    monkeypatch.setitem(
        sys.modules,
        "native_io",
        types.SimpleNamespace(
            execute=execute, finish=lambda *a, **k: None, metric=lambda *a, **k: None
        ),
    )
    monkeypatch.setitem(
        sys.modules,
        "native_structure",
        types.SimpleNamespace(input_pdb=lambda request: (source, None)),
    )
    path = Path(__file__).parents[1] / "src/opendde_workbench/integrations/native_apbs.py"
    spec = importlib.util.spec_from_file_location("apbs_protocol", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with pytest.raises(CommandObserved):
        module.run({"payload": {"ph": ph}})
    (command,) = calls
    assert command[0] == "pdb2pqr"
    assert "--ff=AMBER" in command
    assert "--titration-state-method=propka" in command
    assert command[command.index("--with-ph") + 1] == ph
    assert "--keep-chain" in command and "--drop-water" in command
