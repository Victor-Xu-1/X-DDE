"""Keep shared table and native-pose changes in the normal regression checks."""

import runpy

scope = runpy.run_path("scripts/docking-result-scope.py")


def test_reviewed_docking_batch_routes_to_the_direct_consumers():
    select = scope["exact_presentation"]
    files = scope["ALLOWED"]
    approved = scope["REVIEWED_BLOBS"]
    assert select(files, approved)
    assert not select(files - {"frontend/src/docking/PoseComparison.tsx"}, approved)


def test_unreviewed_shared_or_scientific_changes_keep_the_original_checks():
    select = scope["exact_presentation"]
    files = scope["ALLOWED"]
    approved = scope["REVIEWED_BLOBS"]
    for path, (before, _) in approved.items():
        assert not select(files, {**approved, path: (before, "different")})
    assert not select(files | {"src/opendde_workbench/asset_records.py"}, approved)
