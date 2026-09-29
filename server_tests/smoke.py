"""Operator-run real API/runtime acceptance. Never imported by the ordinary test suite.

Run on the target server after installation; results are not scientific efficacy claims.
"""

import argparse
import json
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4


class Client:
    def __init__(self, url):
        self.url = url.rstrip("/")
        self.csrf = self.call("GET", "/session")["csrf_token"]

    def call(self, method, path, body=None):
        headers = {
            "Content-Type": "application/json",
            "X-Workbench-CSRF": getattr(self, "csrf", ""),
            "Idempotency-Key": str(uuid4()),
        }
        data = json.dumps(body).encode() if body is not None else None
        request = Request(self.url + "/api" + path, data=data, headers=headers, method=method)
        try:
            with urlopen(request, timeout=180) as response:
                return json.load(response)
        except HTTPError as exc:
            raise RuntimeError(
                f"HTTP {exc.code}: {exc.read(4096).decode(errors='replace')}"
            ) from exc

    def task(self, body, timeout):
        job = self.call("POST", "/jobs", body)
        deadline = time.monotonic() + timeout
        while job["status"] in {"queued", "running", "cancelling"}:
            if time.monotonic() > deadline:
                raise TimeoutError(
                    f"Task {job['id']} exceeded acceptance timeout; inspect/cancel explicitly."
                )
            time.sleep(2)
            job = self.call("GET", "/jobs/" + job["id"])
        if job["status"] != "succeeded":
            raise RuntimeError(f"Task {job['id']}: {job['status']}: {job.get('error')}")
        return job


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:4320")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--gpu", action="store_true", help="Explicitly run a small multi-seed GPU prediction"
    )
    parser.add_argument(
        "--cases",
        type=Path,
        help="Reviewed additional native/Harness requests; may incur compute/network costs",
    )
    parser.add_argument("--timeout", type=int, default=7200)
    args = parser.parse_args()
    client = Client(args.url)
    report = {
        "version": client.call("GET", "/session")["version"],
        "started_at": time.time(),
        "cases": [],
    }

    def record(name, function):
        try:
            evidence = function()
            report["cases"].append({"name": name, "status": "passed", "evidence": evidence})
        except Exception as exc:
            report["cases"].append({"name": name, "status": "failed", "error": str(exc)})
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")

    def properties():
        job = client.task(
            {"operation": "properties", "name": "Acceptance: RDKit ethanol", "smiles": ["CCO"]},
            args.timeout,
        )
        result = client.call("GET", f"/jobs/{job['id']}/result")
        molecule = result["molecules"][0]
        assert molecule["available"] and abs(molecule["mw"] - 46.069) < 0.01
        assert molecule["hbd"] == 1 and molecule["hba"] == 1
        return {"job_id": job["id"], "mw": molecule["mw"]}

    def inspect():
        job = client.task(
            {
                "operation": "inspect",
                "name": "Acceptance: native atom parser",
                "components": [{"kind": "ligand", "value": "CCO"}],
            },
            args.timeout,
        )
        result = client.call("GET", f"/jobs/{job['id']}/result")
        assert len(result["atoms"]) >= 3 and result["structure"].endswith(".cif")
        return {"job_id": job["id"], "atom_count": len(result["atoms"])}

    record(
        "native-doctor",
        lambda: {
            "job_id": client.task(
                {"operation": "doctor", "name": "Acceptance: doctor"}, args.timeout
            )["id"]
        },
    )
    record("RDKit descriptors", properties)
    record("native input inspection", inspect)
    if args.gpu:

        def predict():
            job = client.task(
                {
                    "name": "Acceptance: multi-seed ligand",
                    "components": [{"kind": "ligand", "value": "CCO"}],
                    "parameters": {
                        "seed": 101,
                        "additional_seeds": [102],
                        "samples": 2,
                        "steps": 8,
                        "cycles": 1,
                    },
                },
                args.timeout,
            )
            analysis = client.call("GET", f"/jobs/{job['id']}/analysis")
            candidates = analysis["candidates"]
            assert len(candidates) == 4 and len({c["id"] for c in candidates}) == 4
            assert len({c["artifact"] for c in candidates}) == 4
            return {"job_id": job["id"], "candidates": [c["id"] for c in candidates]}

        record("real multi-seed GPU prediction", predict)
    if args.cases:
        cases = json.loads(args.cases.read_text())
        if not isinstance(cases, list) or not 1 <= len(cases) <= 50:
            raise ValueError("Acceptance cases must contain one to50 reviewed requests.")
        for case in cases:
            record(
                case["name"], lambda case=case: {"job_id": client.task(case, args.timeout)["id"]}
            )
    report["finished_at"] = time.time()
    report["all_executed_cases_passed"] = all(c["status"] == "passed" for c in report["cases"])
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    if not report["all_executed_cases_passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
