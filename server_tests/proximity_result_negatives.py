"""Reject inconsistent source references, frames, chemistry and quality evidence."""

import hashlib
import json
from uuid import uuid4


def check_forgery(client, state, identifier, result, task):
    changed = json.loads(json.dumps(task))
    changed["inputs"][0]["source"]["sha256"] = "0" * 64
    changed["scientific_inputs"] = [row["source"] for row in changed["inputs"]]
    assert (
        client.post(
            "/api/jobs", json=changed, headers={"Idempotency-Key": str(uuid4())}
        ).status_code
        == 422
    )
    root = state / "jobs" / identifier / "output"
    report = root / "result.json"
    authored = report.read_bytes()
    row = result["proximity"]["assemblies"][0]
    sdf = root / row["ligand_artifact"]
    original = sdf.read_bytes()
    for mode in ("transform", "quality", "source", "graph", "chemical_artifact"):
        changed = json.loads(authored)
        if mode == "transform":
            changed["proximity"]["assemblies"][0]["partner_b_transform"]["translation"][0] += 10
        elif mode == "quality":
            q = changed["proximity"]["assemblies"][0]["quality"]
            q["accepted"] = not q["accepted"]
        elif mode == "source":
            changed["proximity"]["source_ligand"]["sha256"] = "0" * 64
        elif mode == "graph":
            graph = changed["proximity"]["chemical_graph"]
            graph["bonds"][0][2] = 2 if graph["bonds"][0][2] == 1 else 1
        else:
            lines = original.decode().splitlines()
            count = int(lines[3][:3])
            bond = lines[4 + count]
            order = 2 if int(bond[6:9]) == 1 else 1
            lines[4 + count] = bond[:6] + f"{order:3d}" + bond[9:]
            modified = ("\n".join(lines) + "\n").encode()
            sdf.write_bytes(modified)
            changed["artifact_sha256"][sdf.name] = hashlib.sha256(modified).hexdigest()
        try:
            report.write_text(json.dumps(changed))
            assert client.get("/api/jobs/" + identifier + "/result").status_code == 422, mode
        finally:
            report.write_bytes(authored)
            sdf.write_bytes(original)
    assert client.get("/api/jobs/" + identifier + "/result").json() == result
