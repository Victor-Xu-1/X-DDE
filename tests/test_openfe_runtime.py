"""Reviewed FEP CUDA builds preserve immutable packages and protocol compatibility."""

import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from opendde_workbench.integrations.image import lock_digest, prepare_context
from opendde_workbench.integrations.specs import PROGRAMS


@pytest.fixture
def resolver():
    path = Path(__file__).resolve().parents[1] / "scripts/resolve-openfe-lock.py"
    spec = importlib.util.spec_from_file_location("fep_lock_solver", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_cuda_solver_binds_virtual_driver_and_keeps_package_sha256(resolver, monkeypatch):
    calls = []
    package = {
        "name": "openmm",
        "url": "https://conda.anaconda.org/conda-forge/linux-64/reviewed.conda",
        "sha256": "a" * 64,
    }

    def execute(arguments, **kwargs):
        calls.append((arguments, kwargs))
        return SimpleNamespace(
            returncode=0, stdout=json.dumps({"actions": {"LINK": [package]}}), stderr=""
        )

    monkeypatch.setattr(resolver.subprocess, "run", execute)
    spec = PROGRAMS["openfe"]
    output = resolver.resolve(spec["base"], spec["conda"], "openfe", cuda=True)
    arguments, options = calls[0]
    assert "CONDA_OVERRIDE_CUDA=12.9" in arguments
    assert "cuda-version=12.9" in arguments and "openmm=8.4.0=py312h5a97af1_2" in arguments
    assert "--dry-run" in arguments and "--strict-channel-priority" in arguments
    assert options["timeout"] == 1200 and not options.get("shell")
    assert output == "@EXPLICIT\n" + package["url"] + "#" + package["sha256"] + "\n"


@pytest.mark.parametrize(
    "url,digest",
    [
        ("https://unreviewed.example/package.conda", "a" * 64),
        ("https://conda.anaconda.org/conda-forge/linux-64/package.conda", "a" * 32),
    ],
)
def test_solver_rejects_unreviewed_channel_and_non_sha256_package(
    resolver, monkeypatch, url, digest
):
    monkeypatch.setattr(
        resolver.subprocess,
        "run",
        lambda *a, **k: SimpleNamespace(
            returncode=0,
            stdout=json.dumps(
                {"actions": {"LINK": [{"name": "openmm", "url": url, "sha256": digest}]}}
            ),
            stderr="",
        ),
    )
    with pytest.raises(ValueError, match="trusted channel or SHA256"):
        resolver.resolve("reviewed-base", ["openmm=8.4.0"], "openfe", cuda=True)


def test_openfe_image_uses_cuda12_lock_without_upgrading_the_independent_md_engine(
    tmp_path, monkeypatch
):
    import opendde_workbench.integrations.image as image

    locked = Path(image.__file__).with_name("recipes") / "openfe.conda.txt"
    lines = locked.read_text().splitlines()
    assert any("/cuda-version-12.9" in line for line in lines)
    assert any("/cuda-nvrtc-12." in line for line in lines)
    assert any("/openmm-8.4.0-" in line for line in lines)
    assert not any("/cuda-nvrtc-13." in line or "/cuda-version-13." in line for line in lines)
    before = lock_digest("openfe")
    archives = []
    for line in lines[1:]:
        url, digest = line.rsplit("#", 1)
        archives.append({"file": Path(url.rsplit("/", 1)[1]), "sha256": digest, "url": url})
    staged = []
    monkeypatch.setattr(
        image, "stage_archives", lambda entries, destination: staged.append(entries)
    )
    prepare_context("openfe", tmp_path, archives=archives)
    assert staged == [archives]
    assert (tmp_path / "conda-explicit.txt").read_bytes() == locked.read_bytes()
    generated = (tmp_path / "conda-offline.txt").read_text().splitlines()
    assert generated[1:] == [
        "file:///tmp/native-packages/" + entry["file"].name + "#" + entry["sha256"]
        for entry in archives
    ]
    assert "install --offline" in (tmp_path / "Dockerfile").read_text()
    assert f'org.xdde.science.lock="{before}"' in (tmp_path / "Dockerfile").read_text()
    assert "openmm=8.6.1=py312h5a97af1_0" in PROGRAMS["gromacs"]["conda"]
    assert lock_digest("openfe") == before
