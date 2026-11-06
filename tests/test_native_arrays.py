import io
import struct
from zipfile import ZipFile

import pytest
from confidence_array_fixture import floating, npy, npz

from opendde_workbench.native_arrays import floats, read_array, records


@pytest.mark.parametrize("dtype", ["<f4", ">f4", "<f8", ">f8"])
@pytest.mark.parametrize("fortran", [False, True])
@pytest.mark.parametrize("version", [1, 2])
def test_native_orientation_precision_and_zero(dtype, fortran, version):
    body = [0, 3, 1, 4, 2, 5] if fortran else [0, 1, 2, 3, 4, 5]
    source = npz(pae=floating((2, 3), body, dtype=dtype, fortran=fortran, version=version))
    value = read_array(source, "pae")
    at = floats(value)
    assert [[at(i, j) for j in range(3)] for i in range(2)] == [[0, 1, 2], [3, 4, 5]]


@pytest.mark.parametrize("value", [float("nan"), float("inf"), -1])
def test_invalid_values_outside_the_display_stride_are_rejected(value):
    source = npz(pae=floating((2, 2), [0, value, 1, 2]))
    with pytest.raises(ValueError, match="numeric"):
        floats(read_array(source, "pae"))


def test_unused_object_member_is_never_deserialized_and_selected_objects_are_rejected():
    source = npz(pae=floating((1, 1), [0]), pocket=npy("|O", (), b"not executable pickle"))
    assert floats(read_array(source, "pae"))(0, 0) == 0
    with pytest.raises(ValueError):
        read_array(source, "pocket")
    with pytest.raises(ValueError, match="floating-point"):
        floats(read_array(npz(pae=npy("|O", (1,), b"malicious")), "pae"))


@pytest.mark.parametrize("shape", [(True,), (-1,), (100001,), (20000, 20000), (), (1, 1, 1)])
def test_untrusted_dimensions_fail_before_data_allocation(shape):
    with pytest.raises(ValueError, match="dimensions"):
        read_array(npz(pae=npy("<f4", shape, b"")), "pae")


def test_duplicate_members_and_expansion_limits_are_enforced():
    buffer = io.BytesIO()
    with ZipFile(buffer, "w") as archive:
        archive.writestr("pae.npy", floating((1, 1), [0]))
        with pytest.warns(UserWarning):
            archive.writestr("pae.npy", floating((1, 1), [1]))
    with pytest.raises(ValueError, match="ambiguous"):
        read_array(buffer.getvalue(), "pae")
    source = npz(pae=floating((1000,), [0] * 1000))
    with pytest.raises(ValueError, match="expanded"):
        read_array(source, "pae", limit=1000)


def test_truncation_missing_arrays_and_extra_payload_are_not_valid_data():
    source = npz(pae=floating((1, 1), [0]))
    for broken in (source[:-1], b"", b"PK\x05\x06", source + b"trailing"):
        with pytest.raises(ValueError):
            read_array(broken, "pae")
    with pytest.raises(ValueError, match="unavailable"):
        read_array(source, "pde")
    with pytest.raises(ValueError, match="length"):
        floats(read_array(npz(pae=npy("<f4", (1,), b"\0")), "pae"))


def test_fixed_unicode_and_signed_native_record_fields():
    dtype = [("name", "<U5"), ("mol_type", "|i1"), ("asym_id", "<i4")]
    body = "AA".ljust(5, "\0").encode("utf-32-le") + struct.pack("<bi", 3, 17)
    source = npz(chains=npy(dtype, (1,), body))
    assert list(
        records(read_array(source, "chains"), {"name": "<U5", "mol_type": "|i1", "asym_id": "<i4"})
    ) == [{"name": "AA", "mol_type": 3, "asym_id": 17}]


def test_forged_small_count_cannot_allocate_an_unbounded_central_directory(monkeypatch):
    import opendde_workbench.native_arrays as reader

    buffer = io.BytesIO()
    with ZipFile(buffer, "w") as archive:
        for index in range(100):
            archive.writestr(f"item-{index}.npy", floating((1,), [0]))
    source = bytearray(buffer.getvalue())
    end = source.rfind(b"PK\x05\x06")
    struct.pack_into("<2H", source, end + 8, 1, 1)

    def forbidden(*args, **kwargs):
        raise AssertionError("ZipFile must not see the oversized actual directory")

    monkeypatch.setattr(reader, "ZipFile", forbidden)
    with pytest.raises(ValueError, match="central directory"):
        reader.read_array(bytes(source), "pae")
