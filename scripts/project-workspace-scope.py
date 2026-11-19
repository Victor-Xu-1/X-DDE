"""Keep the reviewed project CI routing change on its own project workflow."""

import os
from hashlib import sha256
from pathlib import Path
from runpy import run_path

scope = run_path(str(Path(__file__).with_name("docking-result-scope.py")))
_PROJECT_PATHS = frozenset({
    "frontend/src/studio/ProjectPanel.tsx",
    "frontend/src/studio/ProjectPanel.test.tsx",
    "frontend/src/studio/ProjectCreateDialog.tsx",
    "frontend/src/studio/projects.css",
    "server_tests/test_project_workspace_browser.py",
    "scripts/project-workspace-scope.py",
})
_WORKFLOW_BLOBS = {
    ".github/workflows/project-workspace-checks.yml": (
        None,
        "b6d5ccdd20fff17c8e22ad255fc197a64563e537",
    ),
    ".github/workflows/restraint-guidance-checks.yml": (
        "34abbaf13842766a6be845410754153c786b2f33",
        "3c16ee9a68a9454369214460dbd0d881d14384b1",
    ),
    ".github/workflows/stat6-template-checks.yml": (
        "01ea0d0abdfc31917b88185427b961ca8889c395",
        "62dafff1b9474bf1b63f94046cbdc898f0be182b",
    ),
    ".github/workflows/task-layout-checks.yml": (
        "519bca9c0ffc68892cf3394133e29bb1031a3196",
        "acc063083caf0c65121ee94ded714847bc73916a",
    ),
}
_SELECTOR_SHA = "c3a0f65f5091199fbe6c1b17fc201968731b81a6cac4612fa43f239071220274"


def project_only(base, event, ref):
    git = scope["git"]
    if event == "push" and ref != "main":
        base = git("merge-base", "origin/main", "HEAD").decode().strip()
    if event not in {"push", "pull_request"} or not base.strip("0"):
        return False
    versions = scope["VERSION_FILES"]
    paths = set(git("diff", "--name-only", base, "HEAD").decode().splitlines())
    if not _WORKFLOW_BLOBS or paths - versions != _PROJECT_PATHS | _WORKFLOW_BLOBS.keys():
        return False
    blob = scope["git_blob"]
    if any(
        (blob(base, path), blob("HEAD", path)) != pair
        for path, pair in _WORKFLOW_BLOBS.items()
    ):
        return False
    source = git("show", "HEAD:scripts/project-workspace-scope.py")
    mask = f'_SELECTOR_SHA = "{_SELECTOR_SHA}"'.encode()
    return (
        sha256(source.replace(mask, b"", 1)).hexdigest() == _SELECTOR_SHA
        and scope["only_version_mirrors"](base, paths & versions)
    )


if __name__ == "__main__":
    value = project_only(
        os.environ.get("BASE", ""),
        os.environ.get("GITHUB_EVENT_NAME", ""),
        os.environ.get("GITHUB_REF_NAME", "main"),
    )
    with Path(os.environ["GITHUB_OUTPUT"]).open("a", encoding="utf-8") as output:
        output.write(f"project_only={str(value).lower()}\n")
