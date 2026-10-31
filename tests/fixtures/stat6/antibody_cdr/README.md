# Frozen native antibody numbering

Native task `ff11e18a-e747-4056-8778-4ceb99d60349` used ANARCII 2.0.8,
IMGT, accuracy mode, PyTorch 2.8.0+cpu on the CC0 deposited 6WGL heavy
(125 aa) and kappa (112 aa) variable-domain sequences. The source FASTA is
already bundled as `6WGL-dupilumab-variable-domains.fasta`, SHA-256
`245d8b320b8e0a8236c4c331af4f75dfa4bec194ebb889483b518e4dad087909`.

| Original artifact | SHA-256 |
| --- | --- |
| result.json | 4f92c1b8dcdfc657c155066e3cf6f55366b600e06c2b2b29fc9087654d352960 |
| domain-000.fasta | fd99059481635e2815812f805afa7f2bb549a1a4ca3509d8fd5026e05efe9886 |
| domain-001.fasta | 2f64d8e42317b4557c1eb6f64330b6a0e5a80f83d45b341c5d892c2f1fdfe5a4 |

Original bytes are unchanged. Isolated store tests rebind only `source`
transport identifiers in a copy and seal that copy through the existing
ExamplePins authority. They replay numbering, never run a model or certify
a structure. 6WGL is the deposited dupilumab Fab / IL4Ralpha pathway
reference, not a direct STAT6 antibody or a new binding result.
