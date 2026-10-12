# FEP protein inputs / FEP 蛋白输入

OpenFE planning reads the prepared PDB once and checks finite coordinates, a supported protein-only residue set, complete backbone atoms and observed C–N geometry. It uses the same peptide validator as OpenMM and GROMACS dynamics. Explicit chain fragments remain separate, including fragments with identical author chain labels; numbering gaps alone never invent missing sequence.

OpenFE 建网前读取准备好的 PDB，检查有限坐标、支持的蛋白残基、完整骨架原子及实际 C–N 几何。肽链校验沿用 OpenMM 和 GROMACS 的同一实现；明确分开的链片段保持分开，作者编号跳跃不会被自动解释或补成缺失序列。

The check does not repair, cap, parameterize or modify the source. Unsupported residues, incomplete backbones and unresolved links require explicit preparation. Passing this input gate does not prove force-field compatibility, successful native thermodynamic legs or scientific convergence. Both-leg and study acceptance remain separate.

输入检查不修复、不封端、不参数化，也不更改原始文件。不支持的残基、缺失骨架或未解决的断链需要先完成明确的结构准备。输入通过不代表力场适配、双腿计算成功或研究收敛；原生计算和科学验收仍单独验证。
