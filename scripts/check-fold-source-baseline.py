"""CI-only failure proof on exact old source, restoring both files unconditionally."""

import hashlib
import json
import os
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

BASE = "bfb33f0c2ac1b702adff481411cf6cde6f61d9ce"
FILES = (
    "src/opendde_workbench/harness_sequences.py",
    "src/opendde_workbench/examples/stat6/antibody_cdr_inputs.py",
)
TESTS = (
    "tests/test_harness_msa.py::test_fold_msa_requires_matching_query",
    "tests/test_antibody_cdr_inputs.py::test_replayed_native_msa_chains_keep_numbered_source",
)


def main():
    if os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("RUNNER_OS") != "Linux":
        raise RuntimeError("Source substitution is limited to isolated Linux CI.")
    root = Path(__file__).resolve().parents[1]
    assert root.is_relative_to(Path(os.environ["GITHUB_WORKSPACE"]).resolve())
    folder = Path(os.environ["RUNNER_TEMP"]) / "fold-source-baseline"
    folder.mkdir(exist_ok=False)
    report = folder / "regression.xml"
    saved = {name: (root / name).read_bytes() for name in FILES}
    try:
        for name in FILES:
            old = subprocess.check_output(["git", "show", BASE + ":" + name], cwd=root)
            (root / name).write_bytes(old)
        outcome = subprocess.run(
            [sys.executable, "-m", "pytest", "-q", *TESTS, "--junitxml=" + str(report)],
            cwd=root,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
            check=False,
        )
        assert outcome.returncode == 1, "Baseline must fail the behavioral regressions."
        tree = ET.parse(report)
        assert not tree.findall(".//error"), "Import/infrastructure errors do not prove regression."
        failures = [
            case for case in tree.findall(".//testcase") if case.find("failure") is not None
        ]
        assert len(failures) == 3
        for case in failures:
            message = case.find("failure").get("message", "")
            expected = (
                "DID NOT RAISE"
                if "requires_matching_query" in case.get("name", "")
                else "differs from its interface annotation"
            )
            assert expected in message
    finally:
        for name, content in saved.items():
            (root / name).write_bytes(content)
    assert all((root / name).read_bytes() == content for name, content in saved.items())
    subprocess.run(["git", "diff", "--exit-code", "--", *FILES], cwd=root, check=True)
    evidence = root / "outputs/antibody-cdr"
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / "fold-source-baseline.json").write_text(
        json.dumps(
            {
                "base": BASE,
                "source_files": list(FILES),
                "regressions": list(TESTS),
                "expected_behavior_failures": 3,
                "infrastructure_errors": 0,
                "final_source_restored": {
                    name: hashlib.sha256(data).hexdigest() for name, data in saved.items()
                },
                "new_model_or_worker_jobs": 0,
            },
            indent=2,
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
