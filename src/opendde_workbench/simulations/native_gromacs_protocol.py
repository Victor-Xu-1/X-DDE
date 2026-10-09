"""Fixed GROMACS 2026.3 stages; no user commands, relaxed warnings or CPU fallback."""

import os
import re
import subprocess
from pathlib import Path

VERSION = "2026.3"


def command(arguments, *, input_text="", timeout=120):
    label = arguments[0]
    logfile = Path("/output", "gromacs-" + label + ".log")
    with logfile.open("a", encoding="utf-8") as stream:
        process = subprocess.run(
            ["gmx", *arguments],
            input=input_text,
            text=True,
            stdout=stream,
            stderr=subprocess.STDOUT,
            cwd="/output",
            env={**os.environ, "GMX_MAXBACKUP": "-1"},
            timeout=timeout,
            check=False,
        )
    if process.returncode:
        raise RuntimeError(
            f"GROMACS {label} failed; inspect its retained native log. No alternate engine was run."
        )
    return logfile


def verify_runtime(device):
    text = command(["--version"]).read_text()
    if not re.search(r"GROMACS version:\s*" + re.escape(VERSION) + r"(?:\s|$)", text):
        raise ValueError("Install the reviewed GROMACS 2026.3 environment.")
    if device == "cuda" and not re.search(r"GPU support:\s*CUDA", text):
        raise ValueError("The selected GROMACS environment does not provide CUDA support.")


def mdp(payload, stage, seed):
    """AMBER/OpenFF cutoff conventions, V-rescale, C-rescale and explicit output stride."""
    minimize = stage == "minimize"
    production = stage == "production"
    steps = round(payload["production_ns"] * 1_000_000 / payload["timestep_fs"])
    stride = steps // payload["frames"] if production else 0
    options = {
        "integrator": "steep" if minimize else "md",
        "nsteps": 5000
        if minimize
        else steps
        if production
        else round(payload["equilibration_ns"] * 1_000_000 / payload["timestep_fs"]),
        "dt": payload["timestep_fs"] / 1000,
        "cutoff-scheme": "Verlet",
        "nstlist": 20,
        "coulombtype": "PME",
        "rcoulomb": 1.0,
        "vdwtype": "Cut-off",
        "vdw-modifier": "Potential-shift",
        "rvdw": 1.0,
        "DispCorr": "EnerPres",
        "pbc": "xyz",
        "constraints": "h-bonds",
        "constraint-algorithm": "lincs",
        "lincs-order": 4,
        "lincs-iter": 1,
        "nstxout": stride,
        "nstvout": 0,
        "nstfout": 0,
        "nstxout-compressed": 0,
        "nstenergy": stride if production else 100,
        "nstcalcenergy": stride if production else 100,
        "nstlog": stride if production else 100,
        "tcoupl": "no" if minimize else "V-rescale",
        "pcoupl": "C-rescale" if production else "no",
        "continuation": "yes" if production else "no",
        "gen-vel": "yes" if stage == "equilibrate" else "no",
        "tinit": 0,
        "ld-seed": seed,
    }
    if minimize:
        options.update(emtol=10, emstep=0.01)
    else:
        options.update({"tc-grps": "System", "tau-t": 1.0, "ref-t": payload["temperature_kelvin"]})
    if stage == "equilibrate":
        options.update({"gen-temp": payload["temperature_kelvin"], "gen-seed": seed})
    if production:
        options.update(
            {"pcoupltype": "isotropic", "tau-p": 5.0, "ref-p": 1.0, "compressibility": 4.5e-5}
        )
    return "\n".join(f"{key} = {value}" for key, value in options.items()) + "\n"


def stage(request, name, phase, coordinates, seed, checkpoint=None):
    payload, execution = request["payload"], request["options"]
    Path("/output", name + ".mdp").write_text(mdp(payload, phase, seed))
    args = [
        "grompp",
        "-f",
        name + ".mdp",
        "-c",
        coordinates,
        "-p",
        "system.top",
        "-o",
        name + ".tpr",
        "-po",
        name + "-resolved.mdp",
    ]
    if checkpoint:
        args += ["-t", checkpoint]
    # Native warnings remain errors: never add -maxwarn or ignore unsupported chemistry.
    command(args)
    device = "gpu" if execution["device"] == "cuda" and phase != "minimize" else "cpu"
    command(
        [
            "mdrun",
            "-deffnm",
            name,
            "-ntmpi",
            "1",
            "-ntomp",
            str(execution["cpu"]),
            "-pin",
            "off",
            "-nb",
            device,
            "-pme",
            device,
            "-bonded",
            "cpu",
            "-update",
            "cpu",
        ],
        timeout=payload["time_limit_seconds"],
    )
