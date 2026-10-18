"""Installed scientific readiness includes the real CLI import boundary."""

from pathlib import Path

import pytest

from opendde_workbench.deployment.native_readiness import verify_native_entrypoint
from opendde_workbench.integrations.image import prepare_context
from opendde_workbench.integrations.specs import PROGRAMS


def test_reinvent_cli_probe_preserves_offline_nonroot_execution_and_does_not_load_models(
    monkeypatch,
):
    monkeypatch.setattr("opendde_workbench.deployment.native_readiness.os.getuid", lambda: 12345)
    monkeypatch.setattr("opendde_workbench.deployment.native_readiness.os.getgid", lambda: 23456)
    calls = []
    verify_native_entrypoint(
        "reinvent", "sha256:fixed-image", lambda args, **kwargs: calls.append((args, kwargs))
    )
    args, kwargs = calls[0]
    assert args[args.index("--user") + 1] == "12345:23456"
    assert args[args.index("--network") + 1] == "none"
    assert "--read-only" in args and "no-new-privileges" in args
    assert args[-4:] == ["--entrypoint", "reinvent", "sha256:fixed-image", "--help"]
    assert "USER=xdde" in args and "TORCHINDUCTOR_CACHE_DIR=/tmp/torch-inductor" in args
    assert "--mount" not in args and "--gpus" not in args
    assert kwargs["timeout"] == 120


@pytest.mark.parametrize("identifier", ["reinvent", "plip", "ligandmpnn"])
def test_failed_cli_initialization_is_not_advertised_as_installed(identifier):
    def fail(args, **kwargs):
        raise RuntimeError("native CLI has a missing runtime library")

    with pytest.raises(RuntimeError, match="missing runtime library"):
        verify_native_entrypoint(identifier, "sha256:fixed-image", fail)


def test_ligandmpnn_startup_is_nonroot_offline_and_never_mounts_models(monkeypatch, tmp_path):
    monkeypatch.setattr("opendde_workbench.deployment.native_readiness.os.getuid", lambda: 12345)
    monkeypatch.setattr("opendde_workbench.deployment.native_readiness.os.getgid", lambda: 23456)
    calls = []
    verify_native_entrypoint(
        "ligandmpnn", "sha256:fixed-image", lambda args, **kwargs: calls.append((args, kwargs))
    )
    args, kwargs = calls[0]
    assert args[-5:] == [
        "--entrypoint",
        "python",
        "sha256:fixed-image",
        "/opt/native/run.py",
        "--help",
    ]
    assert args[args.index("--user") + 1] == "12345:23456"
    assert args[args.index("--network") + 1] == "none" and "--read-only" in args
    assert "--mount" not in args and "--gpus" not in args and kwargs["timeout"] == 120
    assert "USER=xdde" in args and "TORCHINDUCTOR_CACHE_DIR=/tmp/torch-inductor" in args
    source = tmp_path / "source"
    source.mkdir()
    private = source / "run.py"
    private.write_text("# fixed upstream source\n")
    private.chmod(0o600)
    context = tmp_path / "context"
    prepare_context("ligandmpnn", context, source)
    dockerfile = (context / "Dockerfile").read_text()
    assert dockerfile.index("COPY source /opt/native") < dockerfile.index(
        "RUN chmod -R a+rX /opt/native"
    )
    assert "chmod -R 777" not in dockerfile


def test_plip_installation_probes_its_declared_mmcif_parser_without_loading_research():
    calls = []
    verify_native_entrypoint(
        "plip", "sha256:fixed-image", lambda args, **kwargs: calls.append((args, kwargs))
    )
    args, kwargs = calls[0]
    assert args[-5:-1] == ["--entrypoint", "python", "sha256:fixed-image", "-c"]
    assert "from Bio.PDB import MMCIFParser, PDBIO" in args[-1]
    assert "from plip.structure.preparation import PDBComplex" in args[-1]
    assert args[args.index("--network") + 1] == "none" and "--read-only" in args
    assert "--mount" not in args and "--gpus" not in args and kwargs["timeout"] == 120
    assert "biopython=1.88" in PROGRAMS["plip"]["conda"]
    lock = Path(__file__).parents[1] / "src/opendde_workbench/integrations/recipes/plip.conda.txt"
    assert "/biopython-1.88-" in lock.read_text(), (
        "Publish the actual hash-locked parser dependency"
    )


def test_reinvent_recipe_contains_reviewed_rdkit_drawing_libraries():
    assert "scipy==1.18.1" in PROGRAMS["reinvent"]["pip"]
    assert {
        "libxrender1=1:0.9.10-1.1",
        "libxext6=2:1.3.4-1+b1",
        "libexpat1=2.5.0-1+deb12u4",
    } <= set(PROGRAMS["reinvent"]["system_packages"])


def test_reinvent_runtime_library_repair_preserves_cached_python_layers(tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    (source / "README.md").write_text("source fixture")
    destination = tmp_path / "reinvent"
    prepare_context("reinvent", destination, source)
    dockerfile = (destination / "Dockerfile").read_text()
    package_install = dockerfile.index("RUN apt-get")
    assert dockerfile.index("pip install --no-cache-dir") < package_install
    assert dockerfile.index("pip install --no-deps --no-build-isolation") < package_install
    assert package_install < dockerfile.index("LABEL org.xdde.science.program")
    assert "APT::Update::Error-Mode=any" in dockerfile
    assert dockerfile.count("libxrender1=") == 1
    # Existing source-build environments retain their original early libraries.
    destination = tmp_path / "chemprop"
    prepare_context("chemprop", destination)
    other = (destination / "Dockerfile").read_text()
    assert other.index("RUN apt-get") < other.index("pip install --no-cache-dir")
