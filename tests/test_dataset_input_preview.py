"""Byte/work limits for local dataset previews; no scientific engines or fixtures."""

import gzip
import io
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from opendde_workbench.datasets import input_preview


class TrackedInput(io.BytesIO):
    def __init__(self, content):
        super().__init__(content)
        self.bytes_read = 0
        self.read_calls = 0

    def read1(self, size=-1):
        self.read_calls += 1
        data = super().read1(size)
        self.bytes_read += len(data)
        return data


@pytest.fixture
def preview(monkeypatch):
    def request(content, suffix):
        source = TrackedInput(content)
        monkeypatch.setattr(input_preview, "open", lambda *args, **kwargs: source, raising=False)
        asset = SimpleNamespace(kind="library", suffix=suffix)
        assets = SimpleNamespace(get=lambda _: asset, path=lambda _: "input" + suffix)
        app = FastAPI()
        input_preview.register(app, assets)
        with TestClient(app) as client:
            response = client.get(f"/api/datasets/files/{uuid4()}/preview")
        assert source.closed
        return response, source

    return request


def encoded(content, suffix):
    return gzip.compress(content, mtime=0) if suffix.endswith(".gz") else content


def gzip_header_text(content, size, flag=16):
    member = bytearray(gzip.compress(content, mtime=0))
    member[3] = flag
    return bytes(member[:10]) + b"x" * size + b"\0" + bytes(member[10:])


@pytest.mark.parametrize("suffix", [".csv", ".csv.gz", ".tsv", ".tsv.gz"])
def test_small_unicode_tables_preserve_bom_quotes_and_multiline_values(preview, suffix):
    separator = "\t" if ".tsv" in suffix else ","
    content = f'\ufeffID{separator}name\r\n1{separator}"α\nβ"\r\n'.encode()
    response, _ = preview(encoded(content, suffix), suffix)
    assert response.status_code == 200, response.text
    assert response.json()["columns"] == ["ID", "name"]
    assert response.json()["rows"] == [{"ID": "1", "name": "α\nβ"}]


@pytest.mark.parametrize("suffix", [".sdf", ".sdf.gz"])
def test_small_sdf_preserves_complete_unique_properties(preview, suffix):
    content = "\ufeffmolecule\n> <编号>\nα\n\n> 1 <source>\nfile\n\n> <编号>\nβ\n$$$$\n".encode()
    response, _ = preview(encoded(content, suffix), suffix)
    assert response.status_code == 200, response.text
    assert response.json()["sdf_properties"] == ["编号", "source"]
    assert response.json()["table"] is False


@pytest.mark.parametrize("suffix", [".csv.gz", ".sdf.gz"])
@pytest.mark.parametrize("flag", [8, 16], ids=["filename", "comment"])
def test_gzip_header_work_is_bounded_before_decoded_output(preview, suffix, flag):
    response, source = preview(gzip_header_text(b"ID\n1\n", 1024 * 1024, flag), suffix)
    assert response.status_code == 422
    assert "compressed input budget" in response.json()["detail"]
    assert source.bytes_read <= input_preview._COMPRESSED_BYTES + 1
    # Headers are consumed a byte at a time by gzip, not by the underlying file.
    assert source.read_calls <= input_preview._COMPRESSED_BYTES // io.DEFAULT_BUFFER_SIZE + 2


@pytest.mark.parametrize("suffix", [".csv.gz", ".sdf.gz"])
def test_empty_concatenated_members_cannot_evade_compressed_budget(preview, suffix):
    empty = gzip.compress(b"", mtime=0)
    content = empty * (input_preview._COMPRESSED_BYTES // len(empty) + 100)
    content += gzip.compress(b"ID\n1\n", mtime=0)
    response, source = preview(content, suffix)
    assert response.status_code == 422
    assert "compressed input budget" in response.json()["detail"]
    assert source.bytes_read <= input_preview._COMPRESSED_BYTES + 1
    assert source.read_calls < 100


@pytest.mark.parametrize("suffix", [".csv.gz", ".sdf.gz"])
def test_small_concatenated_members_remain_valid(preview, suffix):
    text = b"ID\n1\n" if ".csv" in suffix else b"> <ID>\n1\n$$$$\n"
    content = gzip.compress(b"", mtime=0)
    content += gzip.compress(text[:2], mtime=0) + gzip.compress(text[2:], mtime=0)
    response, _ = preview(content, suffix)
    assert response.status_code == 200, response.text
    if ".csv" in suffix:
        assert response.json()["rows"] == [{"ID": "1"}]
    else:
        assert response.json()["sdf_properties"] == ["ID"]


@pytest.mark.parametrize("suffix", [".csv", ".csv.gz"])
def test_unicode_rows_cannot_exceed_decoded_byte_allowance(preview, suffix):
    content = ("ID\n" + ("😀" * 28000 + "\n") * 5).encode()
    assert len(content) > input_preview._TEXT_BYTES
    response, _ = preview(encoded(content, suffix), suffix)
    assert response.status_code == 422
    assert "text budget" in response.json()["detail"]


@pytest.mark.parametrize("suffix", [".csv", ".csv.gz"])
@pytest.mark.parametrize("delta", [-1, 0, 1])
def test_csv_decoded_byte_boundary(preview, suffix, delta):
    content = ("ID\n" + ("😀" * 26214 + "\n") * 5).encode()
    assert len(content) == input_preview._TEXT_BYTES
    if delta == -1:
        content = content[:-1]
    elif delta == 1:
        content = content[:-1] + b"A\n"
    response, _ = preview(encoded(content, suffix), suffix)
    assert response.status_code == (422 if delta > 0 else 200), response.text
    if delta <= 0:
        assert len(response.json()["rows"]) == 5
        assert response.json()["rows"][0]["ID"] == "😀" * 300


def test_stored_gzip_at_decoded_limit_has_room_for_compression_framing(preview):
    content = ("ID\n" + ("😀" * 26214 + "\n") * 5).encode()
    assert len(content) == input_preview._TEXT_BYTES
    compressed = gzip.compress(content, compresslevel=0, mtime=0)
    assert len(compressed) > input_preview._TEXT_BYTES
    response, _ = preview(compressed, ".csv.gz")
    assert response.status_code == 200, response.text
    assert len(response.json()["rows"]) == 5


@pytest.mark.parametrize("delta", [-1, 0, 1])
def test_gzip_compressed_byte_boundary(preview, monkeypatch, delta):
    monkeypatch.setattr(input_preview, "_COMPRESSED_BYTES", 8192)
    content = b"ID\n1\n"
    size = 8192 - len(gzip.compress(content, mtime=0)) - 1 + delta
    compressed = gzip_header_text(content, size)
    assert len(compressed) == 8192 + delta
    response, source = preview(compressed, ".csv.gz")
    assert response.status_code == (422 if delta > 0 else 200), response.text
    assert source.bytes_read <= 8193


@pytest.mark.parametrize("suffix", [".csv", ".csv.gz"])
def test_five_complete_rows_do_not_require_reading_the_remaining_table(preview, suffix):
    content = b"ID\n1\n2\n3\n4\n5\n" + b"x" * (2 * input_preview._TEXT_BYTES)
    response, _ = preview(encoded(content, suffix), suffix)
    assert response.status_code == 200, response.text
    assert response.json()["rows"] == [{"ID": str(value)} for value in range(1, 6)]


@pytest.mark.parametrize("suffix", [".sdf", ".sdf.gz"])
def test_large_sdf_previews_only_properties_inside_decoded_byte_prefix(preview, suffix):
    content = ("> <EARLY>\nvalue\n\n" + "界" * 210000 + "\n> <LATE>\nvalue\n$$$$\n").encode()
    assert content.index(b"LATE") > 600000
    assert content[input_preview._TEXT_BYTES - 1] >= 128
    response, _ = preview(encoded(content, suffix), suffix)
    assert response.status_code == 200, response.text
    assert response.json()["sdf_properties"] == ["EARLY"]


@pytest.mark.parametrize("suffix", [".sdf", ".sdf.gz"])
@pytest.mark.parametrize("header", [b"> <PART", "> <属性".encode()[:-1]])
def test_sdf_prefix_never_invents_a_name_from_a_partial_property(preview, suffix, header):
    prefix = b"> <EARLY>\nvalue\n\n"
    content = prefix + b"\n" * (input_preview._TEXT_BYTES - len(prefix) - len(header))
    content += header
    content += b"IAL>\nvalue\n" if header == b"> <PART" else "性".encode()[-1:] + b">\nvalue\n"
    response, _ = preview(encoded(content, suffix), suffix)
    assert response.status_code == 200, response.text
    assert response.json()["sdf_properties"] == ["EARLY"]


@pytest.mark.parametrize("suffix", [".sdf", ".sdf.gz"])
def test_sdf_complete_name_at_byte_boundary_is_preserved(preview, suffix):
    header = b"> <VISIBLE>"
    content = b"\n" * (input_preview._TEXT_BYTES - len(header)) + header + b"\nvalue\n"
    response, _ = preview(encoded(content, suffix), suffix)
    assert response.status_code == 200, response.text
    assert response.json()["sdf_properties"] == ["VISIBLE"]


@pytest.mark.parametrize("suffix", [".csv", ".csv.gz"])
@pytest.mark.parametrize("count", [128, 129])
def test_table_column_limit_is_preserved(preview, suffix, count):
    content = (",".join(f"c{index}" for index in range(count)) + "\n").encode()
    response, _ = preview(encoded(content, suffix), suffix)
    assert response.status_code == (200 if count == 128 else 422)


@pytest.mark.parametrize("suffix", [".sdf", ".sdf.gz"])
@pytest.mark.parametrize("count", [128, 129])
def test_sdf_property_limit_is_preserved(preview, suffix, count):
    content = "".join(f"> <p{index}>\nvalue\n\n" for index in range(count)).encode()
    response, _ = preview(encoded(content, suffix), suffix)
    assert response.status_code == (200 if count == 128 else 422)


@pytest.mark.parametrize("suffix", [".csv", ".csv.gz", ".sdf", ".sdf.gz"])
def test_invalid_utf8_inside_the_preview_is_rejected(preview, suffix):
    response, _ = preview(encoded(b"ID\n\xff\n", suffix), suffix)
    assert response.status_code == 422


@pytest.mark.parametrize("suffix", [".csv.gz", ".sdf.gz"])
def test_truncated_gzip_is_a_validation_error(preview, suffix):
    response, _ = preview(gzip.compress(b"ID\n1\n", mtime=0)[:-4], suffix)
    assert response.status_code == 422
