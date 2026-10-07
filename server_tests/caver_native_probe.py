"""Native stable CAVER protocol and covariance gate, in isolated CI only."""

import argparse
import hashlib
import json
import os
import subprocess
from pathlib import Path
from uuid import uuid4

from caver_frame_probe import verify_frames

from opendde_workbench.deployment.transfers import download, extract
from opendde_workbench.space.caver_profiles import read_profiles
from opendde_workbench.space.image import lock_digest, prepare_context
from opendde_workbench.space.manifest import SHA256, URL
from opendde_workbench.space.pdb_frame import canonical_pdb, source_channels

ACHE_URL = "https://files.rcsb.org/download/4EY7.pdb"
ACHE_SHA256 = "6bca2109d7b512a576458c3261e597bb5159e8fb43162c5b6c88df71f9fcdbd2"


def run_native(image, inputs, config, output):
    output.mkdir(parents=True, exist_ok=False)
    name = "xdde-caver-probe-" + uuid4().hex
    command = [
        "docker",
        "run",
        "--rm",
        "--name",
        name,
        "--network",
        "none",
        "--read-only",
        "--user",
        f"{os.getuid()}:{os.getgid()}",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--memory",
        "1536m",
        "--cpus",
        "2",
        "--pids-limit",
        "64",
        "--tmpfs",
        "/tmp:rw,nosuid,nodev,size=128m",
        "--env",
        "HOME=/tmp",
        "--mount",
        f"type=bind,source={inputs},target=/inputs,readonly",
        "--mount",
        f"type=bind,source={config},target=/config.txt,readonly",
        "--mount",
        f"type=bind,source={output},target=/output",
        "--entrypoint",
        "java",
        image,
        "-Xmx1024m",
        "-XX:ActiveProcessorCount=2",
        "-XX:+UseSerialGC",
        "-Duser.home=/tmp",
        "-jar",
        "/opt/caver/caver.jar",
        "-home",
        "/opt/caver",
        "-pdb",
        "/inputs",
        "-conf",
        "/config.txt",
        "-out",
        "/output/native",
    ]
    try:
        with (output / "native.log").open("w") as log:
            subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, check=True, timeout=180)
    finally:
        subprocess.run(["docker", "rm", "--force", name], capture_output=True, timeout=20)
    if sum(p.stat().st_size for p in output.rglob("*") if p.is_file()) > 128 * 1024**2:
        raise ValueError("Native probe output exceeded 128 MiB")
    return read_profiles(
        output / "native/analysis/tunnel_profiles.csv", next(inputs.glob("*.pdb")).name
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    archive = output / "caver.zip"
    download(URL, archive, SHA256, print, lambda: None, limit=64 * 1024**2)
    source = output / "upstream"
    extract(archive, source, lambda: None)
    native_home = source / "caver_3.0/caver"
    context = output / "image-context"
    prepare_context(context, native_home)
    tag = "xdde-caver-probe:" + lock_digest()[:16]
    subprocess.run(["docker", "build", "--tag", tag, context], check=True, timeout=600)
    image = subprocess.check_output(
        ["docker", "image", "inspect", "--format", "{{.Id}}", tag], text=True
    ).strip()
    assert image.startswith("sha256:") and len(image) == 71
    official = source / "caver_3.0/examples/static_structures/2ACE"
    original = (official / "inputs/2ACE.pdb").read_bytes()
    reference, frame_acceptance = verify_frames(
        image,
        original,
        (official / "inputs/config.txt").read_bytes(),
        output,
        run_native,
    )
    frozen = read_profiles(official / "results/analysis/tunnel_profiles.csv", "2ACE.pdb")
    ache = output / "4EY7.pdb"
    download(ACHE_URL, ache, ACHE_SHA256, print, lambda: None, limit=2 * 1024**2)
    text = ache.read_text()
    atoms = [
        row
        for row in text.splitlines()
        if row.startswith("ATOM  ")
        and row[21] == "A"
        and row[16] in {" ", "A"}
        and row[76:78].strip() not in {"H", "D"}
    ]
    assert 1000 < len(atoms) < 15000
    ligand = [
        row
        for row in text.splitlines()
        if row.startswith("HETATM")
        and row[17:20] == "E20"
        and row[21] == "A"
        and row[22:26].strip() == "604"
    ]
    assert len(ligand) == 28, "The frozen native drug must be donepezil with 28 heavy atoms"
    center = [
        sum(float(row[start : start + 8]) for row in ligand) / len(ligand) for start in (30, 38, 46)
    ]
    ache_inputs = output / "ache-inputs"
    ache_inputs.mkdir()
    prepared = "\n".join(row[:16] + " " + row[17:] for row in atoms) + "\nEND\n"
    local, ache_frame = canonical_pdb(prepared.encode("ascii"), center)
    (ache_inputs / "4EY7.pdb").write_bytes(local)
    ache_config = output / "ache-config.txt"
    ache_config.write_text(
        "starting_point_coordinates 0 0 0" + "\nprobe_radius 0.9\nshell_radius 5\nseed 1\n"
    )
    ache_result = run_native(image, ache_inputs, ache_config, output / "ache")
    assert ache_result, "The drug-bound human target must produce native geometric paths"
    receipt = {
        "image": image,
        "source_sha256": SHA256,
        "official_input_sha256": hashlib.sha256(original).hexdigest(),
        "official_reference_paths": len(frozen),
        "fresh_official_paths": len(reference),
        "frame_acceptance": frame_acceptance,
        "drug_computational_frame": ache_frame,
        "drug_target": "4EY7 human acetylcholinesterase / donepezil",
        "drug_input_sha256": ACHE_SHA256,
        "drug_heavy_atoms": len(ligand),
        "drug_target_paths": len(ache_result),
        "drug_source_point": center,
        "drug_context": "observed protein chain A; bound ligand and waters omitted",
        "source_revision": os.environ["GITHUB_SHA"],
        "scientific_acceptance": "pending_matched_scientific_benchmarks",
        "scope": "native_static_geometry_not_whole_linker_passage_or_binding_energy",
    }
    (output / "protocol-acceptance.json").write_text(json.dumps(receipt, indent=2))
    (output / "drug-channels.json").write_text(
        json.dumps(source_channels(ache_result, ache_frame), indent=2)
    )
    print(json.dumps(receipt))


if __name__ == "__main__":
    main()
