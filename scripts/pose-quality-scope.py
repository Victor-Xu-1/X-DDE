"""Route the reviewed pose-quality layout through its archived-result browser gate."""

import os
from pathlib import Path
from runpy import run_path

_VERSION_SCOPE = run_path(str(Path(__file__).with_name("docking-result-scope.py")))
_WORKFLOWS = {
    ".github/workflows/reference-input-checks.yml": (
        "e81c8a29509e898cb54b941c55da189bf9d3463e",
        "79b4a039fa317d2acbded1cd2a6b45e85ca299d6",
    ),
    ".github/workflows/sequence-result-checks.yml": (
        "94d8ca7a0ca6e20fe6c9c6827813497ce7d7b3c9",
        "218c841116deb4a276fb6acf04c8851223840386",
    ),
}
_LAYOUT = {
    "frontend/src/quality/QualityResults.tsx",
    "frontend/src/quality/QualityPreview.tsx",
    "frontend/src/quality/quality-results.css",
    "frontend/src/quality/tests/QualityResults.test.tsx",
}


def reviewed_workflow_changes(base, changed):
    blob = _VERSION_SCOPE["git_blob"]
    return all(
        (blob(base, path), blob("HEAD", path)) == _WORKFLOWS[path]
        for path in changed & _WORKFLOWS.keys()
    )


def quality_layout_only(base, event, ref):
    git = _VERSION_SCOPE["git"]
    if event == "push" and ref != "main":
        base = git("merge-base", "origin/main", "HEAD").decode().strip()
    if event not in {"push", "pull_request"} or not base.strip("0"):
        return False
    changed = set(git("diff", "--name-only", base, "HEAD").decode().splitlines())
    mirrors = _VERSION_SCOPE["VERSION_FILES"]
    allowed = _LAYOUT | mirrors | _WORKFLOWS.keys() | {
        "scripts/pose-quality-scope.py",
        "server_tests/test_quality_context_browser.py",
    }
    return (
        bool(changed & _LAYOUT)
        and changed <= allowed
        and reviewed_workflow_changes(base, changed)
        and _VERSION_SCOPE["only_version_mirrors"](base, changed & mirrors)
    )


if __name__ == "__main__":
    selected = quality_layout_only(
        os.environ.get("BASE", ""),
        os.environ.get("GITHUB_EVENT_NAME", ""),
        os.environ.get("GITHUB_REF_NAME", "main"),
    )
    with Path(os.environ["GITHUB_OUTPUT"]).open("a", encoding="utf-8") as output:
        output.write(f"quality_layout_only={str(selected).lower()}\n")
