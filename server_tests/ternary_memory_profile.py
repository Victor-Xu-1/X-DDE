"""Matched STAT6 R/S integration controls for a proposed smaller CPU memory budget."""

import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path
from uuid import uuid4


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def command(arguments, *, check=True, timeout=15):
    return subprocess.run(arguments, capture_output=True, text=True, timeout=timeout, check=check)


def request_case(root, source, branch, memory_mib):
    from opendde_workbench.integrations.backend import ScientificBackend
    from opendde_workbench.integrations.contract import IntegratedTask
    from opendde_workbench.proximity.options import TernaryPayload

    work = root / ("stat6-" + branch["configuration"].lower() + "-" + str(memory_mib))
    work.mkdir()
    assets = work / "assets"
    assets.mkdir()
    inputs, bindings = [], {}
    for role, name in branch["sources"].items():
        identifier = str(uuid4())
        target = assets / (identifier + Path(name).suffix)
        shutil.copyfile(source / name, target)
        ref = {"asset_id": identifier, "record": 0, "sha256": digest(target)}
        inputs.append({"role": role, "source": ref})
        bindings[identifier] = "/job/assets/" + target.name
    # Keep the published4GiB request contract while explicitly stress-testing a lower
    # kernel cap in CI. This does not enable a smaller platform task budget.
    request = IntegratedTask(
        operation="ternary_model",
        name="STAT6 conditional " + branch["configuration"] + " resource integration control",
        inputs=inputs,
        scientific_inputs=[row["source"] for row in inputs],
        payload=TernaryPayload.model_validate(branch["payload"]),
        options={"device": "cpu", "cpu": 2, "memory_mib": max(4096, memory_mib), "seed": 31},
    )
    (work / "request.json").write_text(request.model_dump_json())
    (work / "bindings.json").write_text(json.dumps(bindings))
    backend = ScientificBackend(None, "deepternary")
    adapter = work / "adapter"
    adapter.mkdir()
    for name in backend.files:
        shutil.copyfile(backend.shared_sources.get(name, backend.root / name), adapter / name)
    (work / "output").mkdir()
    return work, request


def native_case(root, image, models, source, branch, budget):
    from opendde_workbench.integrations.result import validate_result

    work, request = request_case(root, source, branch, budget)
    name = "xdde-ternary-memory-" + uuid4().hex
    args = [
        "docker",
        "create",
        "--name",
        name,
        "--network",
        "none",
        "--read-only",
        "--user",
        str(os.getuid()) + ":" + str(os.getgid()),
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--memory",
        str(budget) + "m",
        "--memory-swap",
        str(budget) + "m",
        "--cpus",
        "2",
        "--pids-limit",
        "256",
        "--tmpfs",
        "/tmp:rw,nosuid,nodev,size=512m",
        "--env",
        "HOME=/tmp",
        "--env",
        "OMP_NUM_THREADS=2",
        "--env",
        "DGLBACKEND=pytorch",
        "--env",
        "XDDE_PROGRAM=deepternary",
        "--env",
        "MPLCONFIGDIR=/tmp/matplotlib",
        "--env",
        "CUDA_VISIBLE_DEVICES=",
        "--env",
        "XDDE_PROFILE_LIMIT_MIB=" + str(budget),
    ]
    for host, target, readonly in (
        (work / "assets", "/input/assets", True),
        (work / "request.json", "/input/request.json", True),
        (work / "bindings.json", "/input/bindings.json", True),
        (work / "adapter", "/platform", True),
        (models, "/models", True),
        (Path(__file__).with_name("ternary_memory_entry.py").resolve(), "/probe/entry.py", True),
        (work / "output", "/output", False),
    ):
        args += [
            "--mount",
            "type=bind,source="
            + str(host)
            + ",target="
            + target
            + (",readonly" if readonly else ""),
        ]
    args += ["--entrypoint", "python", image, "-B", "/probe/entry.py"]
    identifier = command(args).stdout.strip()
    try:
        with (work / "execution.log").open("wb") as stream:
            result = subprocess.run(
                ["docker", "start", "--attach", identifier],
                stdout=stream,
                stderr=subprocess.STDOUT,
                timeout=660,
            )
        state = json.loads(
            command(["docker", "inspect", identifier, "--format", "{{json .State}}"]).stdout
        )
        (work / "native-exit.json").write_text(json.dumps(state, indent=2))
        assert (
            result.returncode == state["ExitCode"] == 0
            and not state["OOMKilled"]
            and not state["Running"]
        ), (work, state)
        profile = json.loads((work / "output/resource-profile.json").read_text())
        assert profile["adapter_completed"] and profile["cgroup_limit_bytes"] == budget * 1024**2
        assert profile["oom_events"] == profile["oom_kill_events"] == 0
        report = validate_result(
            json.loads((work / "output/result.json").read_text()), request, work / "output"
        )
        assert report.proximity.search.returned == 3
        assert report.proximity.search.initialization_protocol == "binary_chemical_frames_v2"
        assert report.proximity.search.anchor_partner == "a"
        files = {}
        scientific = {}
        for assembly in report.proximity.assemblies:
            for artifact in (assembly.ligand_artifact, assembly.complex_artifact):
                path = work / "output" / artifact
                files[artifact] = digest(path)
                lines = path.read_text().splitlines()
                if path.suffix == ".pdb":
                    content = [
                        line
                        for line in lines
                        if line.startswith(("ATOM  ", "HETATM", "CONECT", "TER"))
                    ]
                else:
                    end = next(i for i, line in enumerate(lines) if line.strip() == "M  END")
                    content = lines[3 : end + 1]
                scientific[artifact] = hashlib.sha256("\n".join(content).encode()).hexdigest()
        value = {
            "configuration": branch["configuration"],
            "memory_mib": budget,
            "profile": profile,
            "declared_request_memory_mib": request.options.memory_mib,
            "applied_kernel_stress_limit_mib": budget,
            "platform_budget_enabled": False,
            "artifacts": files,
            "scientific_atom_bond_coordinates": scientific,
            "native_assemblies": [
                row.model_dump(mode="json") for row in report.proximity.assemblies
            ],
            "returned": 3,
            "qualified": sum(row.quality.accepted for row in report.proximity.assemblies),
            "scientific_accuracy_accepted": False,
            "owner_frontend_task": False,
        }
        (work / "review.json").write_text(json.dumps(value, indent=2))
        print(json.dumps(value), flush=True)
        return value
    finally:
        observed = json.loads(
            command(
                ["docker", "inspect", identifier, "--format", "{{json .State}}"], check=False
            ).stdout
            or "{}"
        )
        if observed.get("Running"):
            command(["docker", "kill", identifier])
        command(["docker", "rm", identifier])


def run_profiles(root, image, models):
    from opendde_workbench.integrations.image import lock_digest
    from opendde_workbench.integrations.specs import recipe_digest

    assert os.environ.get("CI") == "true", (
        "Only the isolated CI runner may run these native controls."
    )
    source = Path(__file__).with_name("fixtures") / "stat6-ternary-memory"
    provenance = json.loads((source / "provenance.json").read_text())
    for name, row in provenance["files"].items():
        assert Path(name).name == name and digest(source / name) == row["sha256"]
    (models / "manifest.json").write_text(
        json.dumps(
            {
                "schema_version": 1,
                "program": "deepternary",
                "recipe_sha256": recipe_digest("deepternary"),
                "files": [
                    {"name": p.name, "size": p.stat().st_size, "sha256": digest(p)}
                    for p in (models / "glue.pth", models / "protac.pth")
                ],
            }
        )
    )
    records = []
    try:
        for branch in provenance["branches"]:
            baseline = native_case(root, image, models, source, branch, 4096)
            records.append(baseline)
            smaller = native_case(root, image, models, source, branch, 2048)
            records.append(smaller)
            assert (
                smaller["scientific_atom_bond_coordinates"]
                == baseline["scientific_atom_bond_coordinates"]
            ), "Memory limit changed scientific PDB/SDF atom, bond or coordinate records."
            assert smaller["native_assemblies"] == baseline["native_assemblies"], (
                "Memory limit changed native ranking, geometry or source-frame evidence."
            )
            assert smaller["profile"]["cgroup_peak_bytes"] <= 0.8 * 2048 * 1024**2, (
                "Keep at least20 percent measured container headroom."
            )
        result = {
            "proposed_memory_mib": 2048,
            "records": records,
            "exact_native_output_invariant": True,
            "native_recipe_sha256": recipe_digest("deepternary"),
            "runtime_lock_sha256": lock_digest("deepternary"),
            "fixture_sha256": digest(source / "provenance.json"),
            "scientific_accuracy_accepted": False,
            "owner_frontend_tasks": 0,
            "platform_budget_enabled": False,
        }
        (root / "memory-budget-review.json").write_text(json.dumps(result, indent=2))
    finally:
        (root / "memory-profile-completed-records.json").write_text(json.dumps(records, indent=2))
