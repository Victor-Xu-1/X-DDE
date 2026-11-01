"""Cold-restore exact native R-group follow-ups and preserve the old published cohort."""

import hashlib
import json
import os
import zipfile
from pathlib import Path

import pytest

from opendde_workbench.examples.bundle import restore_bundle, verify_examples
from opendde_workbench.examples.bundle_catalogue import bundle_catalogue
from opendde_workbench.examples.catalogue_profiles import historical_study_catalogue
from opendde_workbench.examples.pins import ExamplePins
from opendde_workbench.examples.stat6_bundle_release import CAPABILITIES, SHA256
from opendde_workbench.store import Store

OLD_SHA = "93edf8010606923e1dddf0d2a7c3d25a6bfa5a9e12763ff9c93bcff5d906d652"
PRIMARY = "23e97ba7-f90e-484d-a21d-0813454c608d"
STAGES = [
    "ff3d98a3-9465-4cbb-a240-8d52996c2104",
    "4ca90aae-aaa5-4b1c-8cbb-ecf45df97b64",
    "d53a9735-3e0e-4651-91f4-e93cfe067df9",
    "bf974dc3-5686-40bd-ae8c-bb889ca58cf3",
    "d3c19f28-4221-458f-9bd2-248d057c0fa7",
]


def test_real_rgroup_followups_keep_native_pose_identity_across_old_archive_replay(settings):
    filename = os.environ.get("WB_REVIEWED_STAT6_ARCHIVE")
    previous = os.environ.get("WB_TEST_PREVIOUS_STAT6_ARCHIVE")
    if not filename or not previous:
        pytest.skip("Focused CI provides both immutable published cohorts")
    restore_bundle(Path(filename), settings, SHA256)
    modules = bundle_catalogue("stat6").modules
    store = Store(settings.state_dir / "jobs.sqlite3")
    pins = ExamplePins(store, settings.state_dir, modules=modules)
    current = {key: pins.get(key, verify=True) for key in ("reinvent.design", "epitope")}
    fixed = current["reinvent.design"]
    assert fixed.revision == 5 and str(fixed.job_id) == PRIMARY
    assert [str(row.job_id) for row in fixed.supporting_evidence] == STAGES
    assert str(current["epitope"].job_id) == "84bca36f-6a5f-4f02-b97f-58ac18964548"
    for dock, quality, expected in zip(
        STAGES[1:3], STAGES[3:5], (2.856476436100953, 2.872098022352299), strict=True
    ):
        native = settings.state_dir / "jobs" / dock / "output" / "pose-001.sdf"
        output = settings.state_dir / "jobs" / quality / "output"
        report = json.loads((output / "result.json").read_bytes())
        assert (output / "molecule-preview.sdf").read_bytes() == native.read_bytes()
        assert (
            hashlib.sha256(native.read_bytes()).hexdigest()
            == report["inputs"]["molecule"]["sha256"]
        )
        assert report["metrics"]["smallest_distance_protein"] == pytest.approx(expected)
        assert report["metrics"]["num_pairwise_clashes_protein"] == 0
        assert report["metrics"]["number_double_bonds_checked"] == 0
        assert len(report["checks"]) == 22
        for kind in ("waters", "organic_cofactors", "inorganic_cofactors"):
            assert "smallest_distance_" + kind not in report["metrics"]
        assert [ref.model_dump() for ref in store.get(quality).request.scientific_inputs] == [
            store.get(quality).request.molecule.model_dump(),
            store.get(quality).request.protein.model_dump(),
        ]
    old = Path(previous)
    assert hashlib.sha256(old.read_bytes()).hexdigest() == OLD_SHA
    with zipfile.ZipFile(old) as source:
        manifest = json.loads(source.read("manifest.json"))
    authored = historical_study_catalogue(manifest["catalogue_sha256"])
    old_primary = next(row for row in manifest["records"]["jobs"] if row["id"] == PRIMARY)
    with store.connect() as db:
        assert (
            db.execute("SELECT request FROM jobs WHERE id=?", (PRIMARY,)).fetchone()[0]
            == old_primary["request"]
        )
    restore_bundle(old, settings, OLD_SHA)
    assert {key: pins.get(key, verify=True) for key in current} == current
    historical = ExamplePins(store, settings.state_dir, modules=authored.modules)
    assert historical.get("reinvent.design", verify=True).revision == 4
    assert historical.get("epitope", verify=True).revision == 3
    assert verify_examples(settings, CAPABILITIES, profile="stat6") == {
        "modules": 58,
        "computed": 58,
        "validated": 0,
    }
    with store.connect() as db:
        assert not db.execute(
            "SELECT id FROM jobs WHERE status IN ('queued','running','cancelling')"
        ).fetchall()
