"""Small format fixtures, never scientific results or example templates."""

import io
import json
import struct
from types import SimpleNamespace
from zipfile import ZIP_DEFLATED, ZipFile


def npy(dtype, shape, payload, *, fortran=False, version=1):
    header = repr({"descr": dtype, "fortran_order": fortran, "shape": shape}).encode()
    prefix = 10 if version == 1 else 12
    header += b" " * ((-prefix - len(header) - 1) % 64) + b"\n"
    return (
        b"\x93NUMPY"
        + bytes([version, 0])
        + len(header).to_bytes(prefix - 8, "little")
        + header
        + payload
    )


def npz(**members):
    buffer = io.BytesIO()
    with ZipFile(buffer, "w", compression=ZIP_DEFLATED) as archive:
        for key, data in members.items():
            archive.writestr(key + ".npy", data)
    return buffer.getvalue()


def floating(shape, values, *, dtype="<f4", **options):
    return npy(
        dtype,
        shape,
        struct.pack(dtype[0] + str(len(values)) + ("f" if dtype[-1] == "4" else "d"), *values),
        **options,
    )


def native_task(root, *, declared=False, samples=1):
    import hashlib

    from opendde_workbench.prediction_sample_export import BOLTZ_OUTPUT

    output = root / "output"
    output.mkdir()
    native = output / BOLTZ_OUTPUT
    native.mkdir(parents=True)
    request = SimpleNamespace(
        operation="boltz_predict", payload=SimpleNamespace(kind="boltz", samples=samples)
    )
    authored = '{"native_format_fixture":true}'
    request.model_dump_json = lambda: authored
    digest = hashlib.sha256(authored.encode()).hexdigest()
    files = {}
    candidates, evidence = [], []
    for index in range(samples):
        identifier = f"structure-{index + 1:03d}"
        raw = f"data_fixture_{index}\n".encode()
        (output / f"{identifier}.cif").write_bytes(raw)
        files[f"{identifier}.cif"] = hashlib.sha256(raw).hexdigest()
        (native / f"prediction_model_{index}.cif").write_bytes(raw)
        sample = {
            "candidate_id": identifier,
            "native_rank": index,
            "structure_artifact": f"{identifier}.cif",
        }
        for metric in ("pae", "pde", "plddt"):
            shape, values = (
                ((3,), [0, 0.87, 1])
                if metric == "plddt"
                else ((3, 3), [index + i for i in range(9)])
            )
            data = npz(**{metric: floating(shape, values)})
            (native / f"{metric}_prediction_model_{index}.npz").write_bytes(data)
            if declared:
                name = f"{identifier}-{metric}.npz"
                (output / name).write_bytes(data)
                files[name] = hashlib.sha256(data).hexdigest()
                sample[metric + "_artifact"] = name
        candidates.append({"id": identifier, "artifact": f"{identifier}.cif"})
        evidence.append(sample)
    result = {
        "operation": "boltz_predict",
        "program": "boltz",
        "version": "2.2.1",
        "request_sha256": digest,
        "candidates": candidates,
        "artifact_sha256": files,
    }
    if declared:
        result["boltz"] = {
            "protocol": "boltz-2.2.1-cif-row-v1",
            "writer_version": "2.2.1",
            "samples": evidence,
        }
    (output / "result.json").write_text(json.dumps(result))
    return request, digest, output, result
