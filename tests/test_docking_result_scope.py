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


def test_desktop_rail_requires_the_reviewed_style_and_browser_changes():
    select = scope["exact_presentation"]
    approved = scope["DESKTOP_LAYOUT_BLOBS"]
    files = approved.keys() | scope["VERSION_FILES"] | scope["SCOPE_FILES"]
    css = "frontend/src/docking/DockingResults.css"
    assert select(files, approved, approved)
    assert not select(files - {css}, approved, approved)
    mixed = files | {"frontend/src/presentation/StructureWorkbench.tsx"}
    assert not select(mixed, approved, approved)
    assert not select(files, {**approved, css: (approved[css][0], "different")}, approved)


def test_paired_comparison_limits_exclusion_to_the_reviewed_cross_module_presentation():
    select = scope["exact_presentation"]
    approved = scope["PAIRED_COMPARISON_BLOBS"]
    files = approved.keys() | scope["VERSION_FILES"] | scope["SCOPE_FILES"]
    browser = "server_tests/test_docking_table_browser.py"
    expected = "frontend/src/simulations/BoundPoseComparison.tsx"
    assert select(files, approved, approved)
    assert not select(files - {browser}, approved, approved)
    mixed = files | {"frontend/src/simulations/molstar-controller.ts"}
    assert not select(mixed, approved, approved)
    unreviewed = {**approved, expected: (approved[expected][0], "unreviewed")}
    assert not select(files, unreviewed, approved)
