"""Select generated-structure presentation changes without unrelated reference-pocket runs."""

import fnmatch
import os
import subprocess

PATTERNS = (
    "frontend/src/diffsbdd/GeneratedCandidates*",
    "frontend/src/diffsbdd/GeneratedCandidateDownload*",
    "frontend/src/diffsbdd/generated-candidate-download.css",
    "frontend/src/presentation/molecular-record*",
    "frontend/src/presentation/artifact-digest*",
    "frontend/src/presentation/MolecularPreview.tsx",
    "frontend/src/examples/review-highlights*",
    "frontend/src/diffsbdd/GeneratedMetricsView*",
    "frontend/src/diffsbdd/generated-metrics*",
    "frontend/src/diffsbdd/DiffResults*",
    "frontend/src/diffsbdd/GenerationRejections*",
    "frontend/src/diffsbdd/CoreVerification*",
    "frontend/src/diffsbdd/CandidateFollowup*",
    "frontend/src/diffsbdd/DiffQualityHandoff*",
    "frontend/src/diffsbdd/useGeneratedRecords*",
    "frontend/src/quality/QualityForm.tsx",
    "frontend/src/quality/tests/QualityForm.test.tsx",
    "server_tests/test_generated_quality_browser.py",
    "scripts/generated-result-scope.py",
    ".github/workflows/generated-candidate-checks.yml",
    ".github/workflows/artifact-digest-checks.yml",
    ".github/workflows/user-interface-checks.yml",
    ".github/workflows/task-layout-checks.yml",
    ".github/workflows/reference-pocket-checks.yml",
    "docs/frontend-layout.md",
    "pyproject.toml",
    "uv.lock",
    "frontend/package*.json",
    "install.sh",
    "install.ps1",
)


def git(*arguments):
    return subprocess.check_output(
        ["git", "-c", "core.commitGraph=false", *arguments], text=True
    ).strip()


def main():
    base = os.environ.get("BASE", "")
    reference = os.environ.get("GITHUB_REF_NAME", "")
    default = os.environ.get("DEFAULT_BRANCH", "main")
    if reference and reference != default and (not base or set(base) == {"0"}):
        base = git("merge-base", "origin/" + default, "HEAD")
    changed = (
        git("diff", "--name-only", base, "HEAD").splitlines() if base and set(base) != {"0"} else []
    )
    selected = (
        bool(changed)
        and any(
            name.startswith("frontend/src/diffsbdd/")
            or name in {
                "server_tests/test_generated_quality_browser.py",
                "scripts/generated-result-scope.py",
            }
            for name in changed
        )
        and all(any(fnmatch.fnmatchcase(name, pattern) for pattern in PATTERNS) for name in changed)
    )
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write("review_only=" + str(selected).lower() + "\n")


if __name__ == "__main__":
    main()
