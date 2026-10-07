"""Install the accepted immutable data through the actual component installer in CI."""

import argparse
import hashlib
import json
import shutil
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient

from opendde_workbench.api import create_app
from opendde_workbench.assets import AssetStore
from opendde_workbench.deployment.installers import install
from opendde_workbench.examples import channel_bundle_release as spec
from opendde_workbench.examples.bundle import restore_bundle
from opendde_workbench.examples.bundle_release import SHA256 as BASE_SHA256
from opendde_workbench.settings import Settings
from opendde_workbench.store import Store


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--base", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    settings = Settings(
        state_dir=output / "state",
        image_file=output / "no-image",
        code_file=output / "no-code",
        model_dir=output / "models",
        cache_dir=output / "cache",
        minimum_free_bytes=0,
    )
    root = output / "components"
    restore_bundle(args.base, settings, BASE_SHA256)
    store = Store(settings.state_dir / "jobs.sqlite3")
    assets = AssetStore(store, settings.state_dir / "assets")
    user = assets.save("retained-user.pdb", "structure", b"HEADER original user attachment\nEND\n")
    before_jobs = {job.id: job.request.model_dump_json() for job in store.list_jobs()}
    destination = root / "downloads" / spec.URL.rsplit("/", 1)[1]
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(args.archive, destination)
    with destination.open("rb") as stream:
        assert hashlib.file_digest(stream, "sha256").hexdigest() == spec.SHA256
    # The existing downloader verifies the real accepted cache; it cannot substitute another zip.
    metadata = install(
        "public-channel-examples",
        root,
        {},
        str(uuid4()),
        print,
        lambda: None,
        state=settings.state_dir,
    )
    assert metadata["bundle_sha256"] == spec.SHA256
    assert metadata["modules"] == 1 and metadata["computed"] == 1
    with store.connect() as db:
        counts = {
            name: db.execute("SELECT count(*) FROM " + name).fetchone()[0]
            for name in ("jobs", "assets", "scientific_objects")
        }
    repeated = install(
        "public-channel-examples",
        root,
        {},
        str(uuid4()),
        print,
        lambda: None,
        state=settings.state_dir,
    )
    assert {
        key: repeated[key] for key in ("modules", "computed", "validated", "bundle_sha256")
    } == {key: metadata[key] for key in ("modules", "computed", "validated", "bundle_sha256")}
    with store.connect() as db:
        assert counts == {
            name: db.execute("SELECT count(*) FROM " + name).fetchone()[0] for name in counts
        }
    assert assets.path(user).read_bytes() == b"HEADER original user attachment\nEND\n"
    assert all(
        store.get(key).request.model_dump_json() == request for key, request in before_jobs.items()
    )
    with TestClient(create_app(settings), base_url="http://127.0.0.1:4320") as client:
        example = client.get("/api/examples/caver.paths").json()
        assert example["computed_result_available"]
        job = example["pin"]["job_id"]
        result = client.get("/api/jobs/" + job + "/result")
        assert result.status_code == 200, result.text
        assert result.json()["channels"]
        assert result.json()["coordinate_frame"] == "original_selected_structural_model"
        assert result.json()["prepared_reference"]["version_id"]
        assert job not in {row["id"] for row in client.get("/api/jobs").json()}
    receipt = {
        "accepted_sha256": spec.SHA256,
        "data_only_install": True,
        "repeat_install_idempotent": True,
        "user_asset_preserved": True,
        "historical_jobs_preserved": len(before_jobs),
        "inference_started": False,
    }
    (output / "installation.json").write_text(json.dumps(receipt, indent=2))
    print(json.dumps(receipt))


if __name__ == "__main__":
    main()
