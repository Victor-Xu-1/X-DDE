"""Delegate exact file-navigation patches to the native workspace checks."""

import os
from pathlib import Path
from runpy import run_path

_SCOPE = run_path(str(Path(__file__).with_name("docking-result-scope.py")))
_REVIEWED_BLOBS = {
    "frontend/src/research/ResearchWorkspace.tsx": (
        "da35e863d2950356e2d36a68c17ec55df0d0c4e1",
        "ef8b4ace9815c50d30ef02e270ca1d79d0f210ff",
    ),
    "frontend/src/research/useResearchRegistration.ts": (
        "178b04c0d71c23335edf6339063ce05049f56361",
        "d92abdbfb8f24778e76cfa226fe4e5155ec70bfc",
    ),
    ".github/workflows/workspace-preview-checks.yml": (
        "f1f21ae7863ca060d54c1e10d5ffa406b82bf2a9",
        "f9a5a7e9063544f923e1cd74a962a7bf3d99542f",
    ),
    ".github/workflows/pose-handoff-checks.yml": (
        "763508b8dab8a815ba9af067b8e7e1473a3f0c65",
        "55b88727a239821aac958bebe304534bd01aebb6",
    ),
    ".github/workflows/structure-layout-checks.yml": (
        "1f7314561a28b6a1311738cfd1d6457072cda3ee",
        "3e94e17aada1528a85905e2e1b198bc564bf092e",
    ),
    ".github/workflows/restraint-guidance-checks.yml": (
        "f3bf05164a88d7dd4317206b4f8ca5656717cd0d",
        "67e57ba80690720c8e167f641502f4dd3a815c9b",
    ),
    ".github/workflows/task-layout-checks.yml": (
        "f76b007d7a850ff22c41bbb7dddf2ea772dc93f0",
        "63495b8c3d807a0d9784e6f7f6fb45c0d96ba1c9",
    ),
}
_NAVIGATION = {
    "frontend/src/research/ResearchWorkspace.test.tsx",
    "frontend/src/research/useResearchFileNavigation.ts",
    "frontend/src/research/research-file-navigation.css",
    "server_tests/test_workspace_preview_browser.py",
    "server_tests/test_workspace_versions_browser.py",
}


def file_navigation_only(base, event, ref):
    git = _SCOPE["git"]
    if event == "push" and ref != "main":
        base = git("merge-base", "origin/main", "HEAD").decode().strip()
    if event not in {"push", "pull_request"} or not base.strip("0"):
        return False
    paths = set(git("diff", "--name-only", base, "HEAD").decode().splitlines())
    mirrors = _SCOPE["VERSION_FILES"]
    allowed = _NAVIGATION | _REVIEWED_BLOBS.keys() | mirrors | {
        "scripts/research-file-navigation-scope.py",
    }
    blob = _SCOPE["git_blob"]
    return (
        bool(paths & _NAVIGATION)
        and paths <= allowed
        and all(
            (blob(base, path), blob("HEAD", path)) == _REVIEWED_BLOBS[path]
            for path in paths & _REVIEWED_BLOBS.keys()
        )
        and _SCOPE["only_version_mirrors"](base, paths & mirrors)
    )


if __name__ == "__main__":
    selected = file_navigation_only(
        os.environ.get("BASE", ""),
        os.environ.get("GITHUB_EVENT_NAME", ""),
        os.environ.get("GITHUB_REF_NAME", "main"),
    )
    with Path(os.environ["GITHUB_OUTPUT"]).open("a", encoding="utf-8") as output:
        output.write(f"file_navigation_only={str(selected).lower()}\n")
