"""Real pinned pip transport acceptance; no scientific data, model or task."""

import hashlib
import json
import os
import subprocess
import venv
import zipfile
from pathlib import Path

import pytest
from pip_download_fixture import FILENAME, InterruptedWheelServer, fixture_wheel

pytestmark = pytest.mark.skipif(
    os.environ.get("CI") != "true" or os.environ.get("WB_TEST_PIP_RESUME") != "1",
    reason="Explicit isolated installer transport acceptance only",
)


@pytest.fixture(scope="module")
def pinned_pip(tmp_path_factory):
    assert os.environ["CI"] == "true"
    root = tmp_path_factory.mktemp("pinned-pip-resume")
    venv.create(root / "env", with_pip=False)
    python = root / "env/bin/python"
    lock = (
        Path(__file__).resolve().parents[1]
        / "src/opendde_workbench/integrations/recipes/mol1-installer.txt"
    )
    subprocess.run(
        [
            "uv",
            "pip",
            "install",
            "--python",
            str(python),
            "--require-hashes",
            "--no-deps",
            "-r",
            str(lock),
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=90,
    )
    observed = subprocess.check_output(
        [str(python), "-m", "pip", "--version"], text=True, timeout=10
    )
    assert observed.startswith("pip 26.2.2 ")
    return python


@pytest.mark.parametrize("corrupt", [False, True])
def test_actual_installer_resumes_complete_bytes_and_keeps_hash_enforcement(
    tmp_path, pinned_pip, corrupt
):
    payload = fixture_wheel()
    expected = hashlib.sha256(payload).hexdigest()
    destination = tmp_path / "download"
    destination.mkdir()
    environment = {
        k: v
        for k, v in os.environ.items()
        if k.lower() not in {"http_proxy", "https_proxy", "all_proxy"}
    }
    environment.update(
        PIP_CONFIG_FILE=os.devnull,
        PIP_DISABLE_PIP_VERSION_CHECK="1",
        PIP_NO_INPUT="1",
        NO_PROXY="127.0.0.1",
    )
    with InterruptedWheelServer(payload, corrupt=corrupt) as server:
        requirements = tmp_path / "transport-only.txt"
        requirements.write_text(f"xdde-transport-fixture @ {server.url} --hash=sha256:{expected}\n")
        result = subprocess.run(
            [
                str(pinned_pip),
                "-m",
                "pip",
                "download",
                "--no-cache-dir",
                "--no-deps",
                "--require-hashes",
                "--resume-retries",
                "5",
                "--retries",
                "0",
                "--timeout",
                "3",
                "--dest",
                str(destination),
                "-r",
                str(requirements),
            ],
            env=environment,
            capture_output=True,
            text=True,
            timeout=45,
        )
        requests = list(server.requests)
    assert any(row["truncated"] for row in requests)
    assert any(row["range"] and 0 < row["start"] < len(payload) for row in requests)
    output = destination / FILENAME
    if corrupt:
        assert result.returncode != 0
        assert "do not match the hashes" in (result.stdout + result.stderr).lower()
        assert not output.exists()
    else:
        assert result.returncode == 0, result.stdout + result.stderr
        assert hashlib.sha256(output.read_bytes()).hexdigest() == expected
        with zipfile.ZipFile(output) as archive:
            assert archive.testzip() is None
    evidence = Path("outputs/pip-resume")
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / ("corrupt-rejected.json" if corrupt else "resume-accepted.json")).write_text(
        json.dumps(
            {
                "installer": "pip26.2.2",
                "transport_fixture": True,
                "scientific_result": False,
                "wheel_bytes": len(payload),
                "expected_sha256": expected,
                "requests": requests,
                "corrupt_response": corrupt,
                "returncode": result.returncode,
                "full_bytes_hash_verified": not corrupt,
                "altered_bytes_rejected": corrupt,
            },
            indent=2,
        )
    )
