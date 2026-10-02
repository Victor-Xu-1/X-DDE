"""Network consent and native database completeness at the execution boundary."""

import io
import tarfile
from dataclasses import replace
from types import SimpleNamespace

import pytest

from opendde_workbench.deployment.native_tools import install_tools
from opendde_workbench.deployment.search_databases import install_search
from opendde_workbench.engine import DockerEngine
from opendde_workbench.models import Prediction
from opendde_workbench.requests import ResourceTask
from opendde_workbench.resources import DATABASES


def test_database_installation_uses_supervised_host_process_and_propagates_pause(
    tmp_path, monkeypatch
):
    from opendde_workbench.deployment.process import Paused

    monkeypatch.setattr(
        "opendde_workbench.deployment.search_databases.shutil.disk_usage",
        lambda _: SimpleNamespace(free=120 * 1024**3),
    )
    installed = {"runtime": {"code": str(tmp_path)}, "opendde-tools": {"directory": str(tmp_path)}}

    def interrupted(args, timeout):
        assert args[0] == "env" and "docker" not in args
        assert str(tmp_path / "models/opendde") in [str(arg) for arg in args]
        assert "--skip-model" in args and "--skip-common" in args
        raise Paused()

    with pytest.raises(Paused):
        install_search(tmp_path, tmp_path, installed, interrupted, lambda _: None, lambda: None)


def test_tool_recipe_uses_the_interruptible_archive_and_preserves_the_license(
    tmp_path, monkeypatch
):
    from opendde_workbench.deployment import native_tools

    work = tmp_path / "operation"
    work.mkdir()
    root = tmp_path / "managed"
    root.mkdir()
    checkpoints = []

    def download(url, destination, checksum, report, checkpoint):
        assert checksum == native_tools.SHA256
        with tarfile.open(destination, "w:gz") as archive:
            for name, data in {
                "LICENSE": b"controlled license fixture",
                "programs/Makefile": b"controlled recipe fixture",
            }.items():
                item = tarfile.TarInfo("zstd-1.5.7/" + name)
                item.size = len(data)
                archive.addfile(item, io.BytesIO(data))
            link = tarfile.TarInfo("zstd-1.5.7/tests/cli-tests/bin/unzstd")
            link.type = tarfile.SYMTYPE
            link.linkname = "zstd"
            archive.addfile(link)

    monkeypatch.setattr(native_tools, "download", download)

    def execute(args):
        if "--network" in args:
            assert args[args.index("--network") + 1] == "none"
        else:
            assert "-C" in args and "zstd-release" in args
            (work / "source/zstd-1.5.7/programs/zstd").write_bytes(b"controlled binary fixture")

    record = install_tools(
        root,
        work,
        {"compute": {"image": "example@sha256:" + "a" * 64}},
        execute,
        lambda _: None,
        lambda: checkpoints.append(True),
    )
    assert checkpoints
    assert (
        root / "tools/opendde/1.5.7-operation/LICENSE"
    ).read_bytes() == b"controlled license fixture"
    assert record["source_sha256"] == native_tools.SHA256


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
