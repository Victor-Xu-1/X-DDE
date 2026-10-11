"""Simulation instructions follow the actual four-page questionnaires."""


def simulation_steps(capability):
    if capability == "openfe.rbfe":
        return [
            (
                "选择 STAT6 蛋白结构和同系列 SDF；分子结合姿势应在同一个蛋白坐标系中对齐。",
                "Choose the STAT6 protein and a congeneric SDF series with bound poses "
                "aligned in the same protein frame.",
            ),
            (
                "选择 2–12 个不同分子；按原始序号核对，搜索或翻页不会改变已有选择。",
                "Select 2–12 distinct molecules and check their original record numbers; "
                "searching or changing pages preserves the selection.",
            ),
            (
                "先规划变化网络，确认原子映射后再计算；可选择温度、重复次数和采样时长。",
                "Plan the molecular network first, inspect atom maps, then calculate; "
                "choose temperature, independent repeats and sampling when needed.",
            ),
            (
                "按名称、原始序号与二维结构核对每个分子，再确认文件和计算阶段后递交。",
                "Review each molecule by name, original record number and 2D structure; "
                "confirm source files and calculation stage before submission.",
            ),
        ]
    if capability in {"openmm.dynamics", "gromacs.dynamics"}:
        return [
            (
                "选择 STAT6 蛋白结构；研究蛋白与小分子时，另加实际结合姿势，保留原始坐标。",
                "Choose the STAT6 protein; add an actual bound ligand pose for a complex "
                "study and retain its original coordinates.",
            ),
            (
                "选择初步检查、标准探索或延长采样；短模拟仅用于初步观察。",
                "Choose an initial check, standard exploration or extended sampling; "
                "short simulations support initial observations only.",
            ),
            (
                "选择温度、独立重复和计算设备；需要时再调整生产与平衡采样时长。",
                "Choose temperature, independent repeats and compute device; "
                "adjust production and equilibration sampling when needed.",
            ),
            (
                "确认原始文件、OpenMM 或 GROMACS 后端及所选模拟条件后递交。",
                "Confirm the source files, OpenMM or GROMACS backend and chosen "
                "simulation conditions before submission.",
            ),
        ]
    return None
