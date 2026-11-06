"""Closed UI delegation for shared job-review layout and its native consumers."""

TEST = "frontend/src/presentation/PredictionJobReview.test.tsx"
BROWSER = "server_tests/test_job_review_layout_browser.py"
PRODUCTION = {
    "frontend/src/presentation/PredictionJobReview.tsx",
    "frontend/src/presentation/PredictionJobOverview.tsx",
    "frontend/src/presentation/PredictionReviewDialog.tsx",
    "frontend/src/presentation/PredictionJobSettings.tsx",
    "frontend/src/presentation/PredictionEntityPreview.tsx",
    "frontend/src/presentation/prediction-job-review.css",
    "frontend/src/integrations/Mol1JobReview.tsx",
    "frontend/src/integrations/BoltzJobReview.tsx",
    "frontend/src/operations/OpenDdeJobReview.tsx",
    "frontend/src/operations/FoldJobReview.tsx",
}
FILES = PRODUCTION | {
    TEST,
    BROWSER,
    "scripts/job-review-scope.py",
    "scripts/prediction-workspace-scope.py",
    "tests/test_prediction_workspace_scope.py",
    ".github/workflows/prediction-workspace-checks.yml",
    "server_tests/test_mol1_final_review_browser.py",
    "server_tests/test_boltz_final_review_browser.py",
    "server_tests/test_opendde_final_review_browser.py",
    "docs/quality/frontend-coverage.md",
    "pyproject.toml",
    "uv.lock",
    "frontend/package.json",
    "frontend/package-lock.json",
    "install.sh",
    "install.ps1",
}


def selected(changed, event="push"):
    changed = set(changed)
    return (
        event in {"push", "pull_request"}
        and TEST in changed
        and changed <= FILES
        and (not changed & PRODUCTION or BROWSER in changed)
    )
