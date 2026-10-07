"""One offline, bounded native CAVER process inside the existing managed container."""

import hashlib
import math
import shutil
import subprocess
from pathlib import Path

if __package__:
    from .manifest import JAR_SHA256
else:
    from manifest import JAR_SHA256


def execute(inputs, output, options):
    jar = Path("/opt/caver/caver.jar")
    if jar.is_symlink() or not 0 < jar.stat().st_size <= 32 * 1024**2:
        raise ValueError("Native CAVER binary is unsafe or oversized.")
    digest = hashlib.sha256()
    with jar.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    if digest.hexdigest() != JAR_SHA256:
        raise ValueError("Native CAVER differs from the reviewed version.")
    config = output / "native-config.txt"
    config.write_text(
        "\n".join(
            [
                "starting_point_coordinates 0 0 0",
                "include *",
                "probe_radius " + str(options.probe_radius_angstrom),
                "shell_radius " + str(options.shell_radius_angstrom),
                "shell_depth " + str(options.shell_depth_angstrom),
                "max_distance " + str(options.maximum_start_displacement_angstrom),
                "desired_radius 5",
                "profile_tunnel_sampling_step " + str(options.profile_step_angstrom),
                "max_number_of_tunnels " + str(options.maximum_candidates),
                "murtagh_matrix_size " + str(options.maximum_candidates),
                "seed 1",
                "load_tunnels no",
                "load_cluster_tree no",
                "compute_errors no",
                "generate_tunnel_characteristics yes",
                "generate_tunnel_profiles yes",
                "save_dynamics_visualization no",
            ]
        )
        + "\n"
    )
    native = output / "native"
    command = [
        "java",
        "-Xmx" + str(options.memory_mib - 512) + "m",
        "-XX:ActiveProcessorCount=" + str(options.cpu),
        "-XX:+UseSerialGC",
        "-Duser.home=/tmp",
        "-jar",
        str(jar),
        "-home",
        "/opt/caver",
        "-pdb",
        str(inputs),
        "-conf",
        str(config),
        "-out",
        str(native),
    ]
    with (output / "native.log").open("w") as log:
        try:
            subprocess.run(
                command,
                stdout=log,
                stderr=subprocess.STDOUT,
                check=True,
                timeout=options.timeout_seconds,
            )
        except subprocess.TimeoutExpired as error:
            raise RuntimeError(
                "The declared channel-analysis time budget was exhausted."
            ) from error
    if sum(p.stat().st_size for p in native.rglob("*") if p.is_file()) > 128 * 1024**2:
        raise ValueError("Native channel diagnostics exceeded the 128 MiB output budget.")
    names = {}
    for name, relative in {
        "tunnel_profiles.csv": "analysis/tunnel_profiles.csv",
        "tunnel_characteristics.csv": "analysis/tunnel_characteristics.csv",
        "origins.pdb": "data/origins.pdb",
        "v_origins.pdb": "data/v_origins.pdb",
    }.items():
        source = native / relative
        if source.is_symlink() or not source.is_file():
            raise ValueError("Native CAVER did not produce complete channel evidence.")
        destination = output / name
        shutil.copyfile(source, destination)
        names[name] = hashlib.sha256(destination.read_bytes()).hexdigest()
    return names


def point(file):
    rows = [row for row in file.read_text().splitlines() if row.startswith(("ATOM  ", "HETATM"))]
    if len(rows) != 1:
        raise ValueError("The single input must have one unambiguous native origin.")
    value = [float(rows[0][start : start + 8]) for start in (30, 38, 46)]
    if not all(math.isfinite(v) and abs(v) <= 100000 for v in value):
        raise ValueError("Native origins must have finite bounded coordinates.")
    return value
