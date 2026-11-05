"""Full native resource validation must not monopolize the HTTP event loop."""

import hashlib
import json
import threading
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import pytest
from conftest import ProcessEngine

from opendde_workbench import api as platform_api
from opendde_workbench.integrations import native_resources, runtime
from opendde_workbench.readiness_cache import ReadinessCache


@pytest.fixture
def native_metadata(tmp_path, monkeypatch):
    root = tmp_path / "models"
    root.mkdir()
    content = b"controlled resource, never deserialized"
    resource = {
        "name": "weights.pt",
        "size": len(content),
        "sha256": hashlib.sha256(content).hexdigest(),
    }
    spec = {"name": "controlled library", "version": "fixture", "gpu": False, "models": [resource]}
    recipe = native_resources.model_recipe_identity(spec)
    (root / resource["name"]).write_bytes(content)
    manifest = root / "manifest.json"
    manifest.write_text(json.dumps({"recipe_sha256": recipe, "files": [resource]}))
    models = {
        "models": str(root),
        "manifest_sha256": hashlib.sha256(manifest.read_bytes()).hexdigest(),
    }
    monkeypatch.setattr(runtime, "PROGRAMS", {"fixture": spec})
    monkeypatch.setattr(runtime, "recipe_digest", lambda _: recipe)
    monkeypatch.setattr(runtime, "configuration", lambda *_: ("sha256:controlled", models))

    async def inspect(_command, *args, **kwargs):
        assert args[:3] == ("docker", "image", "inspect")
        return 0, json.dumps(
            {"org.xdde.science.program": "fixture", "org.xdde.science.recipe": recipe}
        )

    monkeypatch.setattr(
        runtime.container_runtime,
        "selection",
        lambda *_: (
            "sha256:controlled",
            SimpleNamespace(command=inspect),
            None,
        ),
    )
    return root, models


def test_slow_native_file_checks_leave_http_alive_and_share_one_observation(
    settings,
    native_metadata,
    monkeypatch,
    client_factory,
):
    entered, release, joined = threading.Event(), threading.Event(), threading.Event()
    original = native_resources.model_files
    calls = []

    def slow_files(*args, **kwargs):
        calls.append(threading.get_ident())
        entered.set()
        assert release.wait(4), "Metadata fixture was not released"
        return original(*args, **kwargs)

    monkeypatch.setattr(native_resources, "model_files", slow_files)

    class CountedCache(ReadinessCache):
        readers = 0

        async def read(self, key):
            self.readers += 1
            if self.readers == 2:
                joined.set()
            return await super().read(key)

    monkeypatch.setattr(platform_api, "ReadinessCache", CountedCache)

    class NativeReadiness(ProcessEngine):
        async def readiness(self):
            return await runtime.readiness(settings, "fixture")

    engine = NativeReadiness()
    # Emergency release makes the old blocking implementation fail rather than hang.
    guard = threading.Timer(2, release.set)
    with client_factory(engine) as client, ThreadPoolExecutor(max_workers=2) as readers:
        guard.start()
        try:
            first = readers.submit(client.get, "/api/health")
            assert entered.wait(1)
            second = readers.submit(client.get, "/api/health")
            session = client.get("/api/session")
            assert session.status_code == 200
            assert not release.is_set(), "HTTP waited for the native resource walk"
            assert joined.wait(1), "Both health readers must join the retained observation"
            assert len(calls) == 1
        finally:
            release.set()
            guard.cancel()
        for response in (first.result(timeout=5), second.result(timeout=5)):
            assert response.status_code == 200
            assert response.json()["engine"]["ready"]
        assert len(calls) == 1
        assert client.get("/api/jobs").json() == [] and not engine.started


@pytest.mark.parametrize("change", ["missing", "size", "manifest", "recipe", "symlink", "relative"])
def test_background_resource_validation_still_fails_closed(settings, native_metadata, change):
    import asyncio

    root, models = native_metadata
    if change == "missing":
        (root / "weights.pt").unlink()
    elif change == "size":
        (root / "weights.pt").write_bytes(b"changed size")
    elif change == "manifest":
        with (root / "manifest.json").open("a") as output:
            output.write(" ")
    elif change == "recipe":
        manifest = json.loads((root / "manifest.json").read_text())
        manifest["recipe_sha256"] = "0" * 64
        (root / "manifest.json").write_text(json.dumps(manifest))
    elif change == "symlink":
        link = root.with_name("redirected-models")
        link.symlink_to(root, target_is_directory=True)
        models["models"] = str(link)
    else:
        models["models"] = "relative-models"
    state = asyncio.run(runtime.readiness(settings, "fixture"))
    assert not state["ready"] and state["reason"]
    assert state["scientific_acceptance"] == "pending_server_validation"
