"""Candidate-only controlled worker phases; original scientific source stays unchanged."""

import argparse
import hashlib
import importlib
import json
import multiprocessing
import os
import random
import sys
from contextlib import contextmanager
from pathlib import Path

import numpy as np
from rdkit import Chem


def initialize_worker(seed, phase, destination):
    effective = (seed + phase * 1009) % (2**32)
    random.seed(effective)
    np.random.seed(effective)
    row = {
        "root_seed": seed,
        "phase": phase,
        "effective_seed": effective,
        "python_state_sha256": hashlib.sha256(repr(random.getstate()).encode()).hexdigest(),
    }
    with Path(destination).open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(row) + "\n")


class SeededPhases:
    """The reviewed source has one sampling pool and one optimization pool per record."""

    def __init__(self, seeds, directory):
        if not seeds or any(type(seed) is not int or not 0 <= seed < 2**32 for seed in seeds):
            raise ValueError("Explicit bounded integer seeds are required.")
        self.seeds, self.directory, self.calls = tuple(seeds), directory, 0
        directory.mkdir(parents=True, exist_ok=False)

    @contextmanager
    def __call__(self, processes):
        if processes != 1:
            raise ValueError("This controlled native protocol supports exactly one worker.")
        record, phase = divmod(self.calls, 2)
        if record >= len(self.seeds):
            raise ValueError("The original native worker-phase protocol changed.")
        self.calls += 1
        destination = self.directory / f"record-{record}-phase-{phase}.jsonl"
        with multiprocessing.get_context("fork").Pool(
            processes,
            initializer=initialize_worker,
            initargs=(self.seeds[record], phase, destination),
        ) as pool:
            yield pool

    def proof(self):
        if self.calls != 2 * len(self.seeds):
            raise ValueError("The native source skipped a declared input or worker phase.")
        values = []
        for record, seed in enumerate(self.seeds):
            for phase in (0, 1):
                rows = (
                    (self.directory / f"record-{record}-phase-{phase}.jsonl")
                    .read_text()
                    .splitlines()
                )
                if len(rows) != 1:
                    raise ValueError("A native worker restarted; reproducibility is unconfirmed.")
                row = json.loads(rows[0])
                if row["root_seed"] != seed or row["phase"] != phase:
                    raise ValueError("The native worker used another record's seed.")
                values.append({"record": record, **row})
        return values


def main():
    if os.environ.get("CI") != "true":
        raise RuntimeError("This unintegrated method policy is restricted to CI review.")
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--control", type=Path, required=True)
    args = parser.parse_args()
    source, control = args.source.resolve(), args.control.resolve()
    sys.path.insert(0, str(source))
    native = importlib.import_module("ternify")
    protac = importlib.import_module("protac")
    seeds = (31, 31, 137)
    molecule = Chem.SDMolSupplier(str(control / "protac.sdf"))[0]
    if molecule is None:
        raise ValueError("The original control molecule is invalid.")
    with Chem.SDWriter(str(control / "reproducibility-input.sdf")) as writer:
        for _ in seeds:
            writer.write(molecule)
    original = (control / "bounded.inp").read_text()
    lines = original.splitlines()
    if sum(line.startswith("PROTACs:") for line in lines) != 1:
        raise ValueError("The native control has an ambiguous molecular source.")
    settings = (
        "\n".join(
            "PROTACs: reproducibility-input.sdf" if line.startswith("PROTACs:") else line
            for line in lines
        )
        + "\n"
    )
    request = control / "reproducibility.inp"
    request.write_text(settings)
    policy = SeededPhases(seeds, control / "worker-phases")
    protac.Pool = policy
    native.main(str(request))
    (control / "worker-seed-proof.json").write_text(json.dumps(policy.proof(), indent=2))


if __name__ == "__main__":
    main()
