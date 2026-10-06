"""Isolated native paths and checksum-reviewed public DEL examples, never user task fixtures."""

import csv
import gzip
import hashlib
import importlib
import io
import json
import sqlite3
import sys
import zipfile
from pathlib import Path
from uuid import uuid4

from opendde_workbench.datasets.contract import DatasetTask
from opendde_workbench.datasets.result import validate_result
from opendde_workbench.deployment.transfers import download

ROOT = Path(__file__).resolve().parents[1] / "src/opendde_workbench/datasets"
DELI_REVISION = "edeb06ca8ffe6a158c1231c4014e569e04a9b83b"
DELI_SHA = "11912879fdc16f419419f96741e0540c471c18b01f734829d920300e67503d99"


class Native:
    def __init__(self, root, monkeypatch):
        self.root, self.monkeypatch = root, monkeypatch
        for name in ("input/assets", "output", "sources", "tmp"):
            (root / name).mkdir(parents=True, exist_ok=True)
        monkeypatch.syspath_prepend(str(ROOT))
        monkeypatch.syspath_prepend(str(ROOT.parent / "chemistry"))
        spec = importlib.util.spec_from_file_location("platformnative_io", ROOT / "native_io.py")
        self.io = importlib.util.module_from_spec(spec)
        monkeypatch.setitem(sys.modules, "platformnative_io", self.io)
        spec.loader.exec_module(self.io)
        original_connect = sqlite3.connect
        monkeypatch.setattr(
            sqlite3,
            "connect",
            lambda file, *args, **kwargs: original_connect(
                str(self.path(file))
                if isinstance(file, (str, Path))
                and str(file).startswith(("/input/", "/output/", "/sources/", "/tmp/"))
                else file,
                *args,
                **kwargs,
            ),
        )
        from rdkit import Chem

        writer = Chem.SDWriter
        monkeypatch.setattr(Chem, "SDWriter", lambda file: writer(str(self.path(file))))
        monkeypatch.setattr(self.io, "Path", self.path)
        self.bindings = {}

    def path(self, value):
        path = Path(value)
        if path.is_relative_to(self.root):
            return path
        for anchor in ("input", "output", "sources", "tmp", "platform"):
            relative = path.relative_to("/" + anchor) if path.is_relative_to("/" + anchor) else None
            if relative is not None:
                return self.root / anchor / relative
        return path

    def module(self, name):
        # Modules keep their reviewed import names but never retain another test's path bindings.
        for candidate in (
            "library_records",
            "library_database",
            "del_definition",
            "del_fastq",
            "del_count_table",
            "del_statistics",
        ):
            self.monkeypatch.delitem(sys.modules, candidate, raising=False)
        self.monkeypatch.delitem(sys.modules, name, raising=False)
        module = importlib.import_module(name)
        if hasattr(module, "Path"):
            self.monkeypatch.setattr(module, "Path", self.path)
        if name in {"native_del_library", "native_del_decode", "native_del_candidates"}:
            self.monkeypatch.setattr(sys.modules["del_definition"], "Path", self.path)
        return module

    def material(self, content, suffix, role, label=""):
        identifier = str(uuid4())
        file = self.root / "input/assets" / (identifier + suffix)
        file.write_bytes(content)
        self.bindings[identifier] = "/job/assets/" + file.name
        (self.root / "input/bindings.json").write_text(json.dumps(self.bindings))
        return {
            "role": role,
            "source": {"asset_id": identifier, "sha256": hashlib.sha256(content).hexdigest()},
            "label": label,
        }

    def task(self, operation, payload, inputs=(), sources=(), options=None):
        task = DatasetTask(
            operation=operation,
            name="Public native " + operation,
            inputs=list(inputs),
            sources=list(sources),
            scientific_inputs=[item["source"] for item in inputs],
            payload=payload,
            options=options or {},
        )
        (self.root / "input/request.json").write_text(task.model_dump_json(), encoding="utf-8")
        return task

    def check(self, task):
        result = json.loads((self.root / "output/result.json").read_text())
        return validate_result(result, task, self.root / "output")

    def capture(self, task):
        import shutil

        identifier = str(uuid4())
        previous = self.root / "sources" / identifier
        shutil.copytree(self.root / "output", previous)
        result = self.check(task)
        reference = {
            "job_id": identifier,
            "role": result.data_kind,
            "report_sha256": hashlib.sha256((previous / "result.json").read_bytes()).hexdigest(),
        }
        # Only test-owned current outputs; predecessor evidence remains intact.
        for file in (self.root / "output").iterdir():
            if file.is_dir():
                shutil.rmtree(file)
            else:
                file.unlink()
        return reference


def public_del(cache):
    archive = cache / "deli-public-examples.zip"
    download(
        f"https://codeload.github.com/Popov-Lab-UNC/DELi/zip/{DELI_REVISION}",
        archive,
        DELI_SHA,
        lambda _: None,
        lambda: None,
    )
    return zipfile.ZipFile(archive)


def public_definition(archive):
    prefix = "DELi-" + DELI_REVISION + "/examples/example_deli_data_dir/"
    library = json.loads(archive.read(prefix + "libraries/DEL006.json"))
    blocks = {}
    for cycle in library["bb_sets"]:
        name = cycle["bb_set_name"]
        blocks[name] = list(
            csv.DictReader(
                io.StringIO(archive.read(prefix + "building_blocks/" + name + ".csv").decode())
            )
        )
    return {"schema_version": 1, "libraries": {"DEL006": library}, "building_blocks": blocks}


def public_counts(archive, maximum):
    name = "DELi-" + DELI_REVISION + "/examples/UNCDEL006_BRD4_Analyze/UNCDEL006_BRD4.csv.gz"
    buffer = io.StringIO()
    with archive.open(name) as member, gzip.open(member, "rt", newline="") as stream:
        reader = csv.DictReader(stream)
        writer = csv.DictWriter(buffer, fieldnames=reader.fieldnames)
        writer.writeheader()
        for position, row in enumerate(reader):
            if position >= maximum:
                break
            writer.writerow(row)
    return buffer.getvalue().encode()
