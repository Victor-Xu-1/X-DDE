"""Test-only sealed HTTP responses; retain native submission, worker and importer."""

import hashlib
import json
import os
from pathlib import Path

CAPTURE = Path(__file__).resolve().parents[1] / "tests/fixtures/reference_import"
PREFIX = "https://www.ebi.ac.uk/chembl/api/data/molecule/CHEMBL376085"
SITE = "WB_REFERENCE_REPLAY_SITE"
LOG = "WB_REFERENCE_REPLAY_LOG"


def append_event(log, record):
    with Path(log).open("a") as output:
        output.write(json.dumps(record) + "\n")


class ArchiveReplay:
    def __init__(self, capture=CAPTURE, log=None):
        self.capture, self.log = Path(capture), log
        self.responses = json.loads((self.capture / "source.json").read_text())["responses"]
        expected = {(PREFIX + suffix, "CHEMBL376085" + suffix) for suffix in (".json", ".sdf")}
        if (len(self.responses) != 2
                or {(row["url"], row["file"]) for row in self.responses} != expected):
            raise ValueError("Replay must retain exactly the two reviewed public responses.")
        for row in self.responses:
            self.read(row)

    def read(self, row):
        file = self.capture / row["file"]
        if not 0 < row["size"] <= 8 * 1024**2 or file.stat().st_size != row["size"]:
            raise ValueError("Sealed public response bytes changed.")
        raw = file.read_bytes()
        if hashlib.sha256(raw).hexdigest() != row["sha256"]:
            raise ValueError("Sealed public response bytes changed.")
        return raw

    def request_bytes(self, url, body=None, *, require_json=True):
        rows = [row for row in self.responses if row["url"] == url]
        if len(rows) != 1 or body is not None or rows[0]["require_json"] != require_json:
            raise ValueError("No unreviewed request or live-network fallback in archive replay.")
        row = rows[0]
        raw = self.read(row)
        if self.log:
            record = {key: row[key] for key in ("url", "sha256", "captured_at")}
            record.update(mode="sealed_official_response", pid=os.getpid())
            append_event(self.log, record)
        return raw, {"url": url, "response_sha256": row["sha256"],
                     "release": "", "raw_document": raw}


def configure_replay(monkeypatch, directory):
    """Inject the transport seam into this isolated server and its actual importer child."""
    ArchiveReplay()
    directory.mkdir()
    site = directory / "sitecustomize.py"
    site.write_text(
        "import os, runpy\ntry:\n"
        f"    runpy.run_path({str(Path(__file__).resolve())!r})['install']()\n"
        "except BaseException as error:\n"
        "    os.write(2, ('Archive replay bootstrap failed: ' + "
        "type(error).__name__ + '\\n').encode())\n"
        "    os._exit(86)\n"
    )
    log = directory / "requests.jsonl"
    monkeypatch.setenv(SITE, str(directory.resolve()))
    monkeypatch.setenv(LOG, str(log.resolve()))
    previous = os.environ.get("PYTHONPATH")
    monkeypatch.setenv("PYTHONPATH", str(directory) + (os.pathsep + previous if previous else ""))
    return log


def install():
    """Loaded only through the temporary sitecustomize; never packaged in the app."""
    from opendde_workbench import local_process
    from opendde_workbench.discovery import backend, transport

    site, log = Path(os.environ[SITE]), Path(os.environ[LOG])
    if (not site.is_absolute() or not log.is_relative_to(site)
            or not (site / "sitecustomize.py").is_file()):
        raise ValueError("Archive replay requires its isolated temporary context.")
    replay = ArchiveReplay(log=log)
    transport.request_bytes = replay.request_bytes
    native_start = local_process.start
    runner = Path(backend.__file__).with_name("runner.py")

    async def start(python, script, directory, env, **kwargs):
        if script != runner:
            raise ValueError("This preview fixture permits only the native archive importer.")
        child = {**env, SITE: str(site), LOG: str(log),
                 "PYTHONPATH": str(site) + os.pathsep + env["PYTHONPATH"]}
        process = await native_start(python, script, directory, child, **kwargs)
        append_event(log, {"mode": "native_importer_process", "pid": process.pid,
                           "runner": script.name, "job": directory.name})
        return process

    local_process.start = start
