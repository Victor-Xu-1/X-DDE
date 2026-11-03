"""Prove the saved guidance regression on isolated CI, then restore exact source bytes."""

import hashlib
import json
import os
import subprocess
from pathlib import Path

BASE = "078aa0dca711ae987f8e14d6e1043e85a4413529"
FILES = (
    "frontend/src/guided/Questionnaire.tsx",
    "frontend/src/integrations/ScientificForm.tsx",
    "frontend/src/simulations/SimulationForm.tsx",
)


def main():
    if os.environ.get("CI") != "true" or os.environ.get("GITHUB_ACTIONS") != "true":
        raise RuntimeError("Run this source-baseline comparison in isolated CI only.")
    root = Path(__file__).resolve().parents[1]
    temporary = Path(os.environ["RUNNER_TEMP"]).resolve()
    saved = {name: (root / name).read_bytes() for name in FILES}
    report = temporary / "restraint-guide-baseline-vitest.json"
    try:
        for name in FILES:
            original = subprocess.check_output(["git", "show", BASE + ":" + name], cwd=root)
            (root / name).write_bytes(original)
        result = subprocess.run(
            [
                "npx",
                "--no-install",
                "vitest",
                "run",
                "src/guided/QuestionnaireGuidance.test.tsx",
                "--reporter=json",
                "--outputFile=" + str(report),
            ],
            cwd=root / "frontend",
            capture_output=True,
            text=True,
            timeout=120,
        )
        value = json.loads(report.read_text())
        if (
            result.returncode == 0
            or value.get("numFailedTests") != 4
            or value.get("numPassedTests") != 2
        ):
            raise RuntimeError(
                "Expected four optional-step failures and two unchanged GROMACS passes. "
                + result.stderr[-1500:]
            )
    finally:
        for name, data in saved.items():
            (root / name).write_bytes(data)
        if any((root / name).read_bytes() != data for name, data in saved.items()):
            raise RuntimeError("The exact candidate source was not restored.")
    evidence = {
        "baseline": BASE,
        "failed_optional_step_cases": 4,
        "unchanged_no_optional_step_passes": 2,
        "candidate_sources_restored": {
            name: hashlib.sha256(data).hexdigest() for name, data in saved.items()
        },
        "models_or_simulations_run": False,
    }
    (temporary / "restraint-guide-baseline.json").write_text(json.dumps(evidence, indent=2))
    print(json.dumps(evidence))


if __name__ == "__main__":
    main()
