"""Anonymous numerical task UIDs can initialize native Torch CLI caches."""

import getpass
from types import SimpleNamespace

import pytest

from opendde_workbench.integrations.backend import ScientificBackend


@pytest.mark.parametrize("program", ["reinvent", "openfe", "gromacs"])
def test_torch_cli_identity_does_not_require_a_passwd_entry(
    settings, tmp_path, monkeypatch, program
):
    pwd = pytest.importorskip("pwd")
    models = tmp_path / "models"
    models.mkdir()
    monkeypatch.setattr(
        "opendde_workbench.integrations.backend.configuration",
        lambda config, identifier: ("sha256:reviewed-image", {"models": str(models)}),
    )
    job = SimpleNamespace(
        request=SimpleNamespace(
            operation="reinvent_design",
            options=SimpleNamespace(cpu=2, device="cpu"),
        )
    )
    args = ScientificBackend(settings, program).execution_arguments(job, tmp_path)
    environment = dict(
        args[index + 1].split("=", 1) for index, value in enumerate(args) if value == "--env"
    )
    # Reproduce an unmapped container UID independently of the CI runner's passwd.
    for name in ("LOGNAME", "USER", "LNAME", "USERNAME"):
        monkeypatch.delenv(name, raising=False)

    def no_passwd_entry(uid):
        raise KeyError("the numerical task UID has no image passwd entry")

    monkeypatch.setattr(pwd, "getpwuid", no_passwd_entry)
    for name, value in environment.items():
        monkeypatch.setenv(name, value)
    assert getpass.getuser() == "xdde"
    assert environment["TORCHINDUCTOR_CACHE_DIR"].startswith("/tmp/")
    # REINVENT does not inherit OpenMM thread settings as part of this repair.
    assert environment.get("OPENMM_CPU_THREADS") == (None if program == "reinvent" else "2")
    assert "--gpus" not in args
