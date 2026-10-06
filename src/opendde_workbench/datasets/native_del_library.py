"""DELi definition validation and native enumeration of explicitly chosen chemical members."""

import hashlib
import importlib.metadata
import json
from pathlib import Path

from del_definition import barcode_review, definition, prepare_home, theoretical_size
from library_database import create
from library_records import chemistry
from platformnative_io import finish, input_file, progress, source_result, write_csv


def load_definition(request):
    if request["inputs"]:
        file, _ = input_file(request, "definition")
    else:
        root, _ = source_result(request)
        file = root / "del-definition.json"
    if file.stat().st_size > 25 * 1024**2:
        raise ValueError("The self-contained DEL definition exceeds 25 MiB.")
    return definition(json.loads(file.read_text(encoding="utf-8-sig")))


def validate(request):
    value = load_definition(request)
    libraries = prepare_home(value)
    reviews = barcode_review(value)
    summary = [
        {
            "library": name,
            "members": theoretical_size(value["libraries"][name], value),
            "cycles": library.num_cycles,
            "can_enumerate": library.can_enumerate(),
            "barcode_count": library.number_of_barcodes,
        }
        for name, library in libraries.items()
    ]
    Path("/output/del-definition.json").write_text(
        json.dumps(value, ensure_ascii=False), encoding="utf-8"
    )
    Path("/output/barcode-review.json").write_text(
        json.dumps({"cycles": reviews, "libraries": summary})
    )
    finish(
        request,
        importlib.metadata.version("deli-chem"),
        "definition",
        {
            "del-definition.json": "del_library_definition",
            "barcode-review.json": "barcode_quality",
        },
        counts={
            "libraries": len(libraries),
            "building_block_sets": len(reviews),
            "building_blocks": sum(row["members"] for row in reviews),
            "theoretical_members": sum(row["members"] for row in summary),
        },
        metadata={
            "libraries": summary,
            "cycles": reviews,
            "scope": "supplied_library_rules; not measured chemical synthesis yield",
        },
        warnings=["Some barcode pairs were not reviewed within the selected work budget."]
        if any(not row["complete_pair_review"] for row in reviews)
        else [],
    )


def enumerate_members(request):
    from rdkit import Chem

    value = load_definition(request)
    libraries = prepare_home(value)
    options = request["payload"]
    if options["library"] not in libraries:
        raise ValueError("Choose one exact validated DEL library.")
    library = libraries[options["library"]]
    if not library.can_enumerate():
        raise ValueError("This definition does not supply complete chemical enumeration rules.")
    if options["enumerate_all"]:
        size = theoretical_size(value["libraries"][options["library"]], value)
        if size > options["max_members"]:
            raise ValueError("Full enumeration exceeds the confirmed member budget.")
        iterator = library.enumerate(dropped_failed=False, fail_on_error=False, use_tqdm=False)
    else:

        def chosen():
            for identifiers in options["selected_members"]:
                try:
                    yield library.enumerate_by_bb_ids(identifiers)
                except Exception as exc:
                    yield identifiers, type(exc).__name__

        iterator = chosen()
    database = create(Path("/output/library.sqlite"))
    database.execute(
        "CREATE TABLE del_members (id TEXT PRIMARY KEY, library TEXT, cycles TEXT, "
        "compound_id TEXT, error TEXT)"
    )
    count = valid = 0
    candidates = []
    writer = Chem.SDWriter("/output/members.sdf")
    try:
        for item in iterator:
            count += 1
            if count > options["max_members"]:
                raise ValueError("Enumeration exceeded the explicit member budget.")
            if isinstance(item, tuple):
                blocks, reason = item
                identifier = options["library"] + "-" + "-".join(blocks)
                smiles, error = "", "enumeration_failed:" + reason
            else:
                blocks = [block.bb_id for block in item.building_blocks]
                identifier = item.compound_id
                smiles = item.smi if hasattr(item, "smi") and item.smi else ""
                error = None if smiles else "native_enumeration_failed"
            molecule = Chem.MolFromSmiles(smiles) if smiles else None
            if smiles and molecule is None:
                error, smiles = "invalid_enumerated_structure", ""
            compound_id = None
            if molecule is not None:
                canonical, properties = chemistry(molecule)
                compound_id = "cmp-" + hashlib.sha256(canonical.encode()).hexdigest()
                database.execute(
                    "INSERT OR IGNORE INTO compounds VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (
                        compound_id,
                        canonical,
                        Chem.MolToMolBlock(molecule),
                        *properties.values(),
                        molecule.GetNumHeavyAtoms(),
                        0,
                        count - 1,
                        "del",
                    ),
                )
                valid += 1
                if len(candidates) < options["retain"]:
                    molecule.SetProp("_Name", identifier)
                    molecule.SetProp("DEL_ID", identifier)
                    molecule.SetProp("XDDE_COMPOUND_ID", compound_id)
                    molecule.SetProp("XDDE_GEOMETRY", "none")
                    writer.write(molecule)
                    candidates.append(
                        {
                            "id": identifier,
                            "smiles": smiles,
                            "source_job": request["sources"][0]["job_id"],
                            "source_record": count - 1,
                            "artifact": "members.sdf",
                            "record": len(candidates),
                            "geometry": "none",
                        }
                    )
            database.execute(
                "INSERT INTO del_members VALUES (?,?,?,?,?)",
                (identifier, options["library"], json.dumps(blocks), compound_id, error),
            )
            database.execute(
                "INSERT INTO records VALUES (?,?,?,?,?)",
                (count - 1, "del", identifier, compound_id, error),
            )
            if count % 1000 == 0:
                database.commit()
                progress("Enumerating supplied DEL chemistry", count)
        database.commit()
        write_csv(
            "/output/enumerated-members.csv",
            ["member", "library", "cycles", "smiles", "failure"],
            database.execute(
                "SELECT d.id,d.library,d.cycles,c.smiles,d.error "
                "FROM del_members d LEFT JOIN compounds c ON c.id=d.compound_id ORDER BY d.id"
            ),
        )
        unique = database.execute("SELECT COUNT(*) FROM compounds").fetchone()[0]
    finally:
        database.close()
        writer.close()
    artifacts = {
        "library.sqlite": "compound_library",
        "enumerated-members.csv": "enumerated_chemistry",
    }
    if candidates:
        artifacts["members.sdf"] = "enumerated_members_2d"
    else:
        Path("/output/members.sdf").unlink()
    finish(
        request,
        importlib.metadata.version("deli-chem"),
        "library",
        artifacts,
        counts={
            "requested_members": count,
            "enumerated": valid,
            "failed": count - valid,
            "source_records": count,
            "valid_records": valid,
            "rejected_records": count - valid,
            "unique_compounds": unique,
            "duplicate_chemical_records": valid - unique,
        },
        candidates=candidates,
        molecule_artifact="members.sdf" if candidates else None,
        metadata={
            "library": options["library"],
            "chemistry_state": "supplied_enumerated_member; DNA attachment retained as defined",
            "geometry": "2D only; not a minimized conformer or binding pose",
        },
    )
