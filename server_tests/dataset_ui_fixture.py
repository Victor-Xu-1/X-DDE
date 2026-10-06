"""Serve only restored public cases and actual Ketcher assets for scoped browser acceptance."""

import threading
import time
from uuid import uuid4

import uvicorn

from opendde_workbench.api import create_app
from opendde_workbench.deployment.installers import install
from opendde_workbench.deployment.transfers import download
from opendde_workbench.examples.bundle import restore_bundle
from opendde_workbench.examples.dataset_bundle_release import SHA256, URL
from opendde_workbench.locations import atomic_json
from opendde_workbench.settings import Settings


def public_server(root):
    settings = Settings(
        state_dir=root / "state",
        image_file=root / "unused/image",
        code_file=root / "unused/code",
        model_dir=root / "models",
        cache_dir=root / "cache",
        minimum_free_bytes=0,
        allowed_origins=("http://127.0.0.1:4320",),
    )
    archive = root / "dataset-public-cases.zip"
    download(URL, archive, SHA256, print, lambda: None)
    summary = restore_bundle(archive, settings, SHA256)
    assert summary["computed"] == 14
    components = root / "components"
    components.mkdir()
    ketcher = install("ketcher", components, {}, str(uuid4()), print, lambda: None)
    atomic_json(components / "installed.json", {"ketcher": ketcher})
    atomic_json(
        settings.state_dir / "deployment.json", {"root": str(components), "automatic": False}
    )
    app = create_app(settings)
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=4320, log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    until = time.monotonic() + 20
    while not server.started and time.monotonic() < until:
        time.sleep(0.05)
    if not server.started:
        raise RuntimeError("The isolated public-case browser server did not start.")
    return server, thread
