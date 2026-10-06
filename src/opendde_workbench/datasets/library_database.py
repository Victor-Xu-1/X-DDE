"""One streaming library with independent chemical identities and supplier records."""

import sqlite3

SCHEMA = """
CREATE TABLE compounds (
  id TEXT PRIMARY KEY, smiles TEXT NOT NULL UNIQUE, molblock TEXT NOT NULL,
  mw REAL NOT NULL, logp REAL NOT NULL, tpsa REAL NOT NULL, qed REAL NOT NULL,
  hbd INTEGER NOT NULL, hba INTEGER NOT NULL, rotatable INTEGER NOT NULL,
  heavy_atoms INTEGER NOT NULL, is_3d INTEGER NOT NULL,
  source_record INTEGER NOT NULL UNIQUE, supplier TEXT NOT NULL);
CREATE INDEX property_mw ON compounds(mw, id);
CREATE INDEX property_logp ON compounds(logp, id);
CREATE INDEX property_qed ON compounds(qed DESC, id);
CREATE TABLE records (
  record INTEGER PRIMARY KEY, supplier TEXT NOT NULL, supplier_id TEXT NOT NULL,
  compound_id TEXT, error TEXT,
  FOREIGN KEY(compound_id) REFERENCES compounds(id));
CREATE INDEX compound_offers ON records(compound_id);
CREATE INDEX supplier_identifiers ON records(supplier, supplier_id);
"""


def create(path):
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys=ON")
    connection.execute("PRAGMA trusted_schema=OFF")
    connection.execute("PRAGMA cache_size=-16384")
    connection.execute("PRAGMA temp_store=FILE")
    connection.executescript(SCHEMA)
    return connection


def members(connection):
    return connection.execute("SELECT * FROM compounds ORDER BY source_record")
