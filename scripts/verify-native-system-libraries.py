"""Probe reviewed system-library pins in isolated official images, without models."""

import argparse
import json
import subprocess
from pathlib import Path
from uuid import uuid4


INSTALL_AND_VERIFY = r"""
apt-get -o APT::Update::Error-Mode=any -o Acquire::Retries=2 \
  -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 update
apt-get install -y --no-install-recommends "$@"
for requirement do
  package=${requirement%%=*}
  expected=${requirement#*=}
  actual=$(dpkg-query -W -f='${Version}' "$package")
  test "$actual" = "$expected"
  printf 'VERIFIED %s=%s\n' "$package" "$actual"
done
"""


def probe(base, packages):
    name = "xdde-system-libs-" + uuid4().hex
    command = [
        "docker", "run", "--rm", "--name", name,
        "--cpus", "1", "--memory", "512m", "--pids-limit", "64",
        "--entrypoint", "/bin/sh", base, "-ec", INSTALL_AND_VERIFY,
        "xdde-library-probe", *sorted(packages),
    ]
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=240)
        return {
            "base": base,
            "packages": sorted(packages),
            "returncode": result.returncode,
            "stdout": result.stdout[-65536:],
            "stderr": result.stderr[-16384:],
        }
    finally:
        # A client timeout must not leave its private probe container running.
        # Never prune Docker or touch an application container.
        subprocess.run(
            ["docker", "rm", "--force", name],
            capture_output=True, text=True, timeout=30,
        )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--program", action="append", required=True)
    parser.add_argument(
        "--evidence", type=Path,
        default=Path("server_tests/evidence/native-system-libraries.json"),
    )
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    recipes = json.loads(
        (root / "src/opendde_workbench/integrations/recipes.json").read_text()
    )["programs"]
    groups = {}
    for identifier in args.program:
        spec = recipes[identifier]
        if "@sha256:" not in spec["base"] or not spec.get("system_packages"):
            raise ValueError("Probe only immutable images with explicit system libraries.")
        packages = spec["system_packages"]
        if any("=" not in package for package in packages):
            raise ValueError("Every library in this review must retain an exact version.")
        group = groups.setdefault(spec["base"], {"programs": [], "packages": set()})
        group["programs"].append(identifier)
        group["packages"].update(packages)
    evidence = {"scope": "system_library_installation_only_no_models_or_research", "images": []}
    args.evidence.parent.mkdir(parents=True, exist_ok=True)
    try:
        for base, group in groups.items():
            try:
                result = probe(base, group["packages"])
            except (OSError, subprocess.TimeoutExpired) as exc:
                result = {"base": base, "returncode": -1, "error": str(exc)}
            result["programs"] = group["programs"]
            evidence["images"].append(result)
            if result["returncode"]:
                raise RuntimeError("Native system-library probe failed; inspect its retained evidence.")
    finally:
        args.evidence.write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"verified_images": len(groups), "programs": args.program}))


if __name__ == "__main__":
    main()
