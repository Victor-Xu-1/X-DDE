"""Reviewed upstream executable and isolated runtime; no download occurs on import."""

VERSION = "1.3.3"
SOURCE_COMMIT = "6fe1ce2bb9c35c8067de9f49bb9169857dfbad70"
BINARY_SHA256 = "3340c1f49cd3c7c84d8699182a1c6af13c7fa2a22448d1204640446106f72172"
BINARY_BYTES = 2056131000
BINARY_URL = "https://github.com/gnina/gnina/releases/download/v1.3.3/gnina.cuda12.8.static"
PYTHON_IMAGE = (
    "docker.io/library/python@sha256:"
    "54b4fc9408ea4f5d1b1b9c63c7ef1968d46d3b927e00df8ab1f09364593f979f"
)
LICENSES = {
    "LICENSE.APACHE": "https://raw.githubusercontent.com/gnina/gnina/"
    + SOURCE_COMMIT
    + "/LICENSE.APACHE",
    "LICENSE.GNU": "https://raw.githubusercontent.com/gnina/gnina/"
    + SOURCE_COMMIT
    + "/LICENSE.GNU",
}

LICENSE_SHA256 = {
    "LICENSE.APACHE": "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30",
    "LICENSE.GNU": "d8c320ffc0030d1b096ae4732b50d2b811cf95e9a9b7377c1127b2563e0a0388",
}
