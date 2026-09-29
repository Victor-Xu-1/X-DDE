"""Refresh public PDB reference structures from the fixed, documented source list."""

import hashlib
import json
import time
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1] / "frontend/public/references"
REFERENCES = [
    ("7RPZ", "KRAS G12D", "KRAS G12D in complex with MRTX-1133"),
    ("5P9J", "BTK", "BTK1 cocrystallized with ibrutinib"),
    ("6LU7", "SARS-CoV-2 Mpro", "Public reference structure with inhibitor N3"),
    ("7BZ5", "ABAG", "Public antibody-antigen reference complex"),
]


def download(url):
    for attempt in range(3):
        try:
            with urlopen(url, timeout=40) as response:
                data = response.read(6 * 1024**2 + 1)
            if (
                len(data) > 6 * 1024**2
                or b"_atom_site." not in data
                or not data.startswith(b"data_")
            ):
                raise ValueError("Unexpected or oversized PDB structure response.")
            return data
        except OSError:
            if attempt == 2:
                raise
            time.sleep(attempt + 1)


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    manifest = []
    for pdb_id, label, title in REFERENCES:
        url = f"https://files.rcsb.org/download/{pdb_id}.cif"
        data = download(url)
        (ROOT / f"{pdb_id}.cif").write_bytes(data)
        manifest.append(
            {
                "id": pdb_id,
                "label": label,
                "title": title,
                "url": url,
                "source": f"https://www.rcsb.org/structure/{pdb_id}",
                "sha256": hashlib.sha256(data).hexdigest(),
                "license": "CC0-1.0",
                "kind": "experimental reference; not a workbench prediction",
            }
        )
        print(f"{pdb_id}: {len(data)} bytes")
    (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
