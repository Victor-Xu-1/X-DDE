"""Network consent and native database completeness at the execution boundary."""

from dataclasses import replace
from types import SimpleNamespace

import pytest

from opendde_workbench.deployment.search_databases import install_search
from opendde_workbench.engine import DockerEngine
from opendde_workbench.models import Prediction
from opendde_workbench.requests import ResourceTask
from opendde_workbench.resources import DATABASES


def test_host_network_is_operator_configured_and_never_enables_an_offline_task(
    settings, tmp_path, monkeypatch
):
    monkeypatch.setenv("HTTPS_PROXY", "http://private-credential@127.0.0.1:7890")
    configured = replace(settings, engine_network="host")
    runtime = ("example/image@sha256:" + "a" * 64, tmp_path)
    offline = SimpleNamespace(
        id="offline",
        request=Prediction(name="offline", components=[{"kind": "protein", "value": "EVQLVESGG"}]),
    )
    args = DockerEngine(configured).arguments(offline, tmp_path, runtime)
    assert args[args.index("--network") + 1] == "none"
    assert "HTTPS_PROXY" not in args
    resource = SimpleNamespace(
        id="public-resources",
        request=ResourceTask(name="native databases", targets=["search"], allow_network=True),
    )
    args = DockerEngine(configured).arguments(resource, tmp_path, runtime)
    assert args[args.index("--network") + 1] == "host"
    assert "HTTPS_PROXY" in args
    assert not any("private-credential" in value for value in args)


@pytest.mark.parametrize("complete", [False, True])
def test_search_installation_requires_all_native_databases(tmp_path, complete, monkeypatch):
    monkeypatch.setattr(
        "opendde_workbench.deployment.search_databases.shutil.disk_usage",
        lambda _: SimpleNamespace(free=120 * 1024**3),
    )
    root = tmp_path / "deployment"
    root.mkdir()
    installed = {
        "compute": {"image": "example@sha256:" + "a" * 64},
        "runtime": {"code": str(tmp_path)},
        "opendde-tools": {"directory": str(tmp_path)},
    }

    def execute(args, timeout):
        assert "--skip-model" in args and "--skip-common" in args
        assert timeout == 43200
        destination = root / "models/opendde/search_database"
        destination.mkdir()
        files = [file for names in DATABASES.values() for file in names]
        for file in files if complete else files[:-1]:
            (destination / file).write_text(">public\nACDE\n")

    if complete:
        result = install_search(root, tmp_path, installed, execute, lambda _: None, lambda: None)
        assert len(result["files"]) == 4
    else:
        with pytest.raises(ValueError, match="all required"):
            install_search(root, tmp_path, installed, execute, lambda _: None, lambda: None)
