"""Route the reviewed docking workbench presentation to its targeted browser check."""

import os
import subprocess
import tomllib
from pathlib import Path

REVIEWED_BLOBS = {
    ".github/workflows/docking-result-scope.yml": (
        "bd9cee7aa8ff2939ced8642c75ae6572af943e0c", "4cda438b82d2d4c24bfcee123eaebe7858088928",
    ),
    ".github/workflows/pocket-result-checks.yml": (
        "8a1dc1ab7111a6db734f7fd31b95f3a02bd1a36c", "ba1321369e9bbd44ac5d279091af054777ae1219",
    ),
    ".github/workflows/pose-handoff-checks.yml": (
        "a4349cf3ba4be49bef4b8db608ea3f8811f62531", "763508b8dab8a815ba9af067b8e7e1473a3f0c65",
    ),
    "frontend/src/docking/DockingPoseSummary.tsx": (
        None, "b0c338ae662e059b9e578334d92429927b0c577e",
    ),
    "frontend/src/docking/DockingResults.css": (
        "80c34d8bb282f9794c645e653aacfc6203b301ce", "9bc4fda4c8acee01473ed87660892ceba72b3d30",
    ),
    "frontend/src/docking/DockingResults.test.tsx": (
        "522234e268d358cf7df3094c629453bc46646b55", "d7da88e34414aa36b86457cc376e2e38c77e00fd",
    ),
    "frontend/src/docking/DockingResults.tsx": (
        "58ee8872fdae5022fc4bd5d96c3dd8150ccba026", "8b9f8df0a98a22ec99f01a976e96a8e308a22751",
    ),
    "frontend/src/docking/PoseComparison.css": (
        "e5ae14223767e40a0a6d7b53c6c7645591707808", "e1e8af33c3e91d98a20f6318c7daae50507511b8",
    ),
    "frontend/src/docking/PoseComparison.tsx": (
        "731e5bc12853549a01256c1b4006f4984170f75c", "112543a727b27ac6f2bf7cbfd8f709e523ec9208",
    ),
    "frontend/src/docking/PoseTable.tsx": (
        "a0ebf42c66612cc0407b4a91140f77f752594013", "38275825014df6f992cbcaec324bb09e0325206b",
    ),
    "frontend/src/presentation/CandidateReviewBar.tsx": (
        "9a9f14c6a35a6f357c3f7661e90498d518d1c8b7", "f7396e5501043652751320124c8949b33ee3e50c",
    ),
    "frontend/src/presentation/ResearchTable.test.tsx": (
        "1ffde51bec5ac7c4a4e94b3714b2586b463e1d19", "ea54cef56578c79ae5d6de86a1e6af6df38888bc",
    ),
    "frontend/src/presentation/ResearchTable.tsx": (
        "d854e112164e77aa90f1371a952903c4c910c2df", "7bc9ad1de894e9463c014851f778072428f266ab",
    ),
    "server_tests/test_docking_table_browser.py": (
        "b6a5dc541257a75ea9eebd298ef31d9b383fd17e", "18f31218adf99d3caeb94af9113dbde71930ea14",
    ),
}
VERSION_FILES = {
    "pyproject.toml",
    "uv.lock",
    "frontend/package.json",
    "frontend/package-lock.json",
    "install.sh",
    "install.ps1",
}
SCOPE_FILES = {
    "scripts/docking-result-scope.py",
    "tests/test_docking_result_scope.py",
}
DESKTOP_LAYOUT_BLOBS = {
    ".github/workflows/docking-result-scope.yml": (
        "4cda438b82d2d4c24bfcee123eaebe7858088928", "1ba44b1022dd339c7cdd97ca28dd5a320d9f17d3",
    ),
    ".github/workflows/pose-handoff-checks.yml": (
        "55b88727a239821aac958bebe304534bd01aebb6", "90c77020a4717e73d2072c1940fc6c300519a7a5",
    ),
    "frontend/src/docking/DockingResults.css": (
        "9bc4fda4c8acee01473ed87660892ceba72b3d30", "e8c96f9bab57721e9ec95a8e1965e71f8c934993",
    ),
    "server_tests/test_docking_table_browser.py": (
        "18f31218adf99d3caeb94af9113dbde71930ea14", "7777578822ddd374458b4e9b5fcb768b97e7ffe3",
    ),
}
ALLOWED = REVIEWED_BLOBS.keys() | VERSION_FILES | SCOPE_FILES


def git(*args):
    return subprocess.check_output(["git", "-c", "core.commitGraph=false", *args])


def git_blob(revision, path):
    result = subprocess.run(
        ["git", "rev-parse", "--verify", f"{revision}:{path}"],
        capture_output=True, text=True, check=False,
    )
    return result.stdout.strip() if result.returncode == 0 else None


def exact_presentation(paths, blobs, reviewed=REVIEWED_BLOBS):
    return (
        reviewed.keys() <= paths <= reviewed.keys() | VERSION_FILES | SCOPE_FILES
        and all(blobs.get(path) == pair for path, pair in reviewed.items())
    )


def only_version_mirrors(base, paths):
    before = tomllib.loads(git("show", f"{base}:pyproject.toml").decode())["project"]["version"]
    after = tomllib.loads(git("show", "HEAD:pyproject.toml").decode())["project"]["version"]
    return all(
        git("show", f"{base}:{path}").replace(before.encode(), after.encode())
        == git("show", f"HEAD:{path}")
        for path in paths
    )


def presentation_scope(base, event):
    if event not in {"push", "pull_request"}:
        return None
    branch_push = event == "push" and os.environ.get("GITHUB_REF_NAME", "main") != "main"
    if branch_push or not base or not base.strip("0"):
        base = git("merge-base", "origin/main", "HEAD").decode().strip()
    paths = set(git("diff", "--name-only", base, "HEAD").decode().splitlines())
    blobs = {
        path: (git_blob(base, path), git_blob("HEAD", path))
        for path in paths & (REVIEWED_BLOBS.keys() | DESKTOP_LAYOUT_BLOBS.keys())
    }
    for name, reviewed in (("desktop", DESKTOP_LAYOUT_BLOBS), ("presentation", REVIEWED_BLOBS)):
        if exact_presentation(paths, blobs, reviewed) and only_version_mirrors(
            base, paths & VERSION_FILES
        ):
            return name
    return None


if __name__ == "__main__":
    selected = presentation_scope(
        os.environ.get("BASE", ""), os.environ.get("GITHUB_EVENT_NAME", "")
    )
    with Path(os.environ["GITHUB_OUTPUT"]).open("a", encoding="utf-8") as output:
        output.write(f"presentation_only={str(selected is not None).lower()}\n")
        output.write(f"desktop_layout_only={str(selected == 'desktop').lower()}\n")
