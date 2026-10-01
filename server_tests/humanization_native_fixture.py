"""Actual upstream CPU scores and explicit variable-region preparation on CI only."""

import json
import os
import subprocess

from test_native_antibodies import HEAVY, LIGHT


def direct_reference(image, directory):
    script = r"""
import json
from pathlib import Path
import torch
import sapiens
from anarcii import Anarcii
from promb import init_db
from promb.db import HUMAN_REFERENCE_DB_PATH, HUMAN_SWISSPROT_DB_PATH

torch.set_num_threads(2)
torch.set_num_interop_threads(1)
assert not Path(HUMAN_REFERENCE_DB_PATH).exists()
assert not Path(HUMAN_SWISSPROT_DB_PATH).exists()
inputs = json.loads(Path('/output/starting.json').read_text())
model = Anarcii(seq_type='antibody', mode='accuracy', cpu=True, ncpu=2,
                batch_size=8, verbose=False, return_logits=False)
domains = model.number(inputs, scfv=False)
sequences = {}
for name, original in inputs.items():
    domain = domains[name]
    assert not domain['error'] and domain['scheme'] == 'imgt'
    sequence = original[domain['query_start']:domain['query_end']+1]
    assert sequence == ''.join(aa for _,aa in domain['numbering'] if aa!='-')
    if name == 'heavy':
        # A deliberately unusual framework position makes a real positive proposal control.
        values = list(sequence)
        values[6] = 'W' if values[6] != 'W' else 'A'
        sequence = ''.join(values)
    sequences[name] = sequence
raw = ''.join('>'+name+'\n'+seq+'\n' for name,seq in sequences.items())
raw += '>unsupported\n'+'X'*80+'\n'
Path('/output/input.fasta').write_text(raw)
database = init_db('human-oas', verbose=False)
expected = {}
for name,sequence in sequences.items():
    chain = domains[name]['chain_type']
    table = sapiens.predict_scores(sequence, chain,
        checkpoint_path='/opt/xdde-sapiens/models/'+('vh' if chain=='H' else 'vl'),
        tokenizer_path='/opt/xdde-sapiens/models/tokenizer')
    values = [{aa:float(v) for aa,v in table.loc[i].items()} for i in range(len(sequence))]
    peptides = database.chop_seq_peptides(sequence)
    matches = [database.contains(peptide) for peptide in peptides]
    expected[name] = {'sequence':sequence, 'scores':values,
        'mean':sum(row[aa] for row,aa in zip(values,sequence))/len(sequence),
        'matched':sum(matches), 'peptides':len(matches),
        'fraction':database.compute_peptide_content(sequence)}
Path('/output/direct.json').write_text(json.dumps(expected,allow_nan=False))
"""
    (directory / "starting.json").write_text(json.dumps({"heavy": HEAVY, "light": LIGHT}))
    subprocess.run(
        [
            "docker",
            "run",
            "--rm",
            "--network",
            "none",
            "--read-only",
            "--user",
            f"{os.getuid()}:{os.getgid()}",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges",
            "--memory",
            "4g",
            "--cpus",
            "2",
            "--pids-limit",
            "64",
            "--tmpfs",
            "/tmp:rw,nosuid,nodev,size=256m",
            "--env",
            "HOME=/tmp",
            "--mount",
            f"type=bind,source={directory},target=/output",
            "--entrypoint",
            "python",
            image,
            "-B",
            "-c",
            script,
        ],
        check=True,
        timeout=240,
    )


def assert_native_reference(row, expected):
    assert row["source_sequence"] == expected["sequence"] and row["status"] == "evaluated"
    assert len(row["original_scores"]) == len(expected["scores"])
    for actual, native in zip(row["original_scores"], expected["scores"], strict=True):
        assert actual.keys() == native.keys()
        assert all(abs(actual[key] - native[key]) < 1e-7 for key in actual)
    evaluation = row["original_evaluation"]
    assert abs(evaluation["mean_native_residue_probability"] - expected["mean"]) < 1e-7
    assert evaluation["matched_peptides"] == expected["matched"]
    assert evaluation["total_peptides"] == expected["peptides"]
    assert evaluation["oas_peptide_fraction"] == expected["fraction"]
