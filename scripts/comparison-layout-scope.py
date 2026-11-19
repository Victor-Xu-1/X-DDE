"""Select archived browser checks for a presentation-only comparison change."""

import os
import subprocess
import tomllib
from pathlib import Path
from runpy import run_path

REVIEWED_BLOBS = {
    ".github/workflows/structure-comparison-checks.yml": (
        "6b14ddb7fe8bd2a7bb2cf89200e9ac50fb3a4af5", "d6e494f80fbd5416e7b693096e7824591fa20376",
    ),
    "frontend/src/structure-comparison/ComparisonPreview.tsx": (
        "2b2e0e6051ea9f073aa6d9f69036e94456c51be4", "401238a0d9a064cbbb10a21ab0e31a495c723116",
    ),
    "frontend/src/structure-comparison/ComparisonResults.tsx": (
        "45617ac09ac011a717253a51f9b70ebdfdbee8ac", "fb835910e414b90fd21cd899146a395847d23234",
    ),
    "frontend/src/structure-comparison/comparison-result-view.css": (
        None, "9a60914cda0db230b71819e53193326e3d70b6a7",
    ),
    "server_tests/comparison_browser_harness.py": (
        "2bdd1cd609da59341da09778c6f589ac22e4d7f1", "f529135499b2d05dab175efc68b81c4001efe563",
    ),
    "server_tests/test_archived_comparison_browser.py": (
        None, "c2be3257edfe5b0077617d30402fe0a3f4bd5047",
    ),
}
LAYOUT = {
    "frontend/src/structure-comparison/ComparisonPreview.tsx",
    "frontend/src/structure-comparison/ComparisonResults.tsx",
    "frontend/src/structure-comparison/comparison-result-view.css",
}
VERSION_FILES = {
    "pyproject.toml",
    "uv.lock",
    "frontend/package.json",
    "frontend/package-lock.json",
    "install.sh",
    "install.ps1",
}
ALLOWED = REVIEWED_BLOBS.keys() | VERSION_FILES | {
    "scripts/comparison-layout-scope.py",
    "tests/test_structure_comparison_layout_scope.py",
}


def git(*args):
    return subprocess.check_output(["git", "-c", "core.commitGraph=false", *args])


def git_blob(revision, path):
    result = subprocess.run(
        ["git", "rev-parse", "--verify", f"{revision}:{path}"],
        capture_output=True, text=True, check=False,
    )
    return result.stdout.strip() if result.returncode == 0 else None


def exact_layout(changed, blobs):
    return (
        bool(changed & LAYOUT)
        and changed <= ALLOWED
        and all(blobs.get(path) == REVIEWED_BLOBS[path] for path in changed & REVIEWED_BLOBS.keys())
    )


def pure_publication_bump(base, paths):
    before = tomllib.loads(git("show", f"{base}:pyproject.toml").decode())["project"]["version"]
    after = tomllib.loads(git("show", "HEAD:pyproject.toml").decode())["project"]["version"]
    return all(
        git("show", f"{base}:{path}").replace(before.encode(), after.encode())
        == git("show", f"HEAD:{path}")
        for path in paths
    )


def layout_only(base, event):
    if event not in {"push", "pull_request"}:
        return False
    branch_push = event == "push" and os.environ.get("GITHUB_REF_NAME", "main") != "main"
    if branch_push or not base or not base.strip("0"):
        base = git("merge-base", "origin/main", "HEAD").decode().strip()
    changed = set(git("diff", "--name-only", base, "HEAD").decode().splitlines())
    shared = run_path(str(Path(__file__).with_name("molecular-utility-scope.py")))
    if shared["aligned_comparison_selected"](changed, event, base):
        return True
    blobs = {
        path: (git_blob(base, path), git_blob("HEAD", path))
        for path in changed & REVIEWED_BLOBS.keys()
    }
    return exact_layout(changed, blobs) and pure_publication_bump(base, changed & VERSION_FILES)


if __name__ == "__main__":
    selected = layout_only(os.environ.get("BASE", ""), os.environ.get("GITHUB_EVENT_NAME", ""))
    with Path(os.environ["GITHUB_OUTPUT"]).open("a", encoding="utf-8") as output:
        output.write(f"layout_only={str(selected).lower()}\n")
