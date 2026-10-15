"""CI-only Linux solver; pin independent scientific process environments by SHA256."""

import argparse
import json
import re
import subprocess
from pathlib import Path


def package_identity(url, digest):
    match = re.fullmatch(
        r"https://conda\.anaconda\.org/conda-forge/(?:linux-64|noarch)/"
        r"([A-Za-z0-9_.+-]+\.(?:conda|tar\.bz2))",
        url,
    )
    if not match or not re.fullmatch(r"[a-f0-9]{64}", digest):
        raise ValueError("Native dependency lacks a trusted channel or SHA256 identity.")
    filename = match[1].removesuffix(".conda").removesuffix(".tar.bz2")
    name, version, build = filename.rsplit("-", 2)
    return {"name": name, "spec": f"{name}={version}={build}", "url": url, "sha256": digest}


def retained_packages(file):
    lines = file.read_text().splitlines()
    if not lines or lines[0] != "@EXPLICIT":
        raise ValueError("Preserving dependencies requires the existing explicit lock.")
    packages = []
    for line in lines[1:]:
        if not line.strip():
            continue
        identity = line.rsplit("#", 1)
        if len(identity) != 2:
            raise ValueError("Existing native packages require their explicit SHA256 identities.")
        packages.append(package_identity(*identity))
    if not packages or len({row["name"] for row in packages}) != len(packages):
        raise ValueError("Existing native dependency identities must be nonempty and unique.")
    return packages


def explicit_lock(packages, retained=()):
    by_name = {}
    for package in packages:
        value = package_identity(package["url"], package["sha256"])
        if value["name"] in by_name:
            raise ValueError("The native solver returned duplicate package identities.")
        by_name[value["name"]] = value
    for original in retained:
        if by_name.get(original["name"]) != original:
            raise ValueError(
                "The native solve changed a retained dependency; review it explicitly."
            )
    if not by_name:
        raise ValueError("The native solve returned no installable package identities.")
    order = {row["name"]: index for index, row in enumerate(retained)}
    ordered = sorted(
        by_name.values(), key=lambda row: (order.get(row["name"], len(order)), row["name"])
    )
    return "@EXPLICIT\n" + "\n".join(row["url"] + "#" + row["sha256"] for row in ordered) + "\n"


def resolve(base, requirements, name, cuda=False, retained=()):
    arguments = ["docker", "run", "--rm"]
    if cuda:
        arguments += ["--env", "CONDA_OVERRIDE_CUDA=12.9"]
    process = subprocess.run(
        [
            *arguments,
            "--entrypoint",
            "micromamba",
            base,
            "create",
            "--dry-run",
            "--json",
            "--platform",
            "linux-64",
            "--channel",
            "conda-forge",
            "--strict-channel-priority",
            "--prefix",
            "/tmp/xdde-" + name + "-resolve",
            *requirements,
            *(row["spec"] for row in retained),
        ],
        check=False,
        capture_output=True,
        text=True,
        timeout=1200,
    )
    if process.returncode:
        print(process.stdout[-12000:])
        print(process.stderr[-12000:])
        raise SystemExit("The scientific environment solver failed; no lock was accepted.")
    packages = json.loads(process.stdout)["actions"]["LINK"]
    print(f"Resolved {len(packages)} immutable Linux packages for {name}")
    return explicit_lock(packages, retained)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--program", choices=("openfe", "gromacs", "plip"), default="openfe")
    parser.add_argument("--preserve-existing", action="store_true")
    args = parser.parse_args()
    program = args.program
    root = Path(__file__).resolve().parents[1]
    recipes = root / "src/opendde_workbench/integrations"
    spec = json.loads((recipes / "recipes.json").read_text(encoding="utf-8"))["programs"][program]

    def retained(name):
        return (
            retained_packages(recipes / "recipes" / (name + ".conda.txt"))
            if args.preserve_existing
            else ()
        )

    plans = {
        program: resolve(
            spec["base"],
            spec["conda"],
            program,
            cuda=program == "openfe",
            retained=retained(program),
        )
    }
    if spec.get("execution_conda"):
        plans[program + "-engine"] = resolve(
            spec["base"],
            spec["execution_conda"],
            program + "-engine",
            cuda=True,
            retained=retained(program + "-engine"),
        )
    for name, plan in plans.items():
        (recipes / "recipes" / (name + ".conda.txt")).write_text(plan, encoding="utf-8")


if __name__ == "__main__":
    main()
