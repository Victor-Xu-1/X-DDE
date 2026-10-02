import json

from opendde_workbench.settings import Settings


def test_configured_virtual_environment_interpreters_are_not_resolved(tmp_path, monkeypatch):
    base = tmp_path / "base/python3"
    base.parent.mkdir()
    base.write_text("base interpreter")
    virtual = tmp_path / "science/venv/bin/python"
    virtual.parent.mkdir(parents=True)
    virtual.symlink_to(base)
    monkeypatch.setenv("WB_STATE_DIR", str(tmp_path / "state"))
    monkeypatch.setenv("WB_HARNESS_PYTHON", str(virtual))
    monkeypatch.setenv("WB_DIFFSBDD_PYTHON", str(virtual))
    settings = Settings.from_env()
    assert settings.harness_python == virtual
    assert settings.diffsbdd_python == virtual
    assert settings.harness_python.resolve() == base


def test_managed_interpreter_paths_preserve_the_installed_environment(tmp_path, monkeypatch):
    state = tmp_path / "state"
    root = tmp_path / "components"
    state.mkdir()
    root.mkdir()
    virtual = tmp_path / "managed/venv/bin/python"
    virtual.parent.mkdir(parents=True)
    base = tmp_path / "python3"
    base.write_text("base interpreter")
    virtual.symlink_to(base)
    (state / "deployment.json").write_text(json.dumps({"root": str(root)}))
    (root / "installed.json").write_text(
        json.dumps({"harness": {"python": str(virtual)}, "diffsbdd": {"python": str(virtual)}})
    )
    monkeypatch.setenv("WB_STATE_DIR", str(state))
    monkeypatch.delenv("WB_HARNESS_PYTHON", raising=False)
    monkeypatch.delenv("WB_DIFFSBDD_PYTHON", raising=False)
    settings = Settings.from_env()
    assert settings.harness_python == virtual
    assert settings.diffsbdd_python == virtual
