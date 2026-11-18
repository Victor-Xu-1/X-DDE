"""Keep scientific source and mixed changes in the normal comparison checks."""

import runpy


scope = runpy.run_path("scripts/comparison-layout-scope.py")


def test_exact_reviewed_layout_uses_the_archived_chrome_replay():
    approved = scope["REVIEWED_BLOBS"]
    select = scope["exact_layout"]
    paths = scope["ALLOWED"]
    assert select(paths, approved)
    assert not select(paths - scope["LAYOUT"], approved)


def test_changes_to_the_preview_source_or_harness_require_full_checks():
    approved = scope["REVIEWED_BLOBS"]
    select = scope["exact_layout"]
    paths = scope["ALLOWED"]
    for path, (before, _) in approved.items():
        assert not select(paths, {**approved, path: (before, "different")})
    assert not select(
        paths | {"src/opendde_workbench/structure_comparison/presentation.py"},
        approved,
    )
