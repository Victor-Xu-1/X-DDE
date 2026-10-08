import { researchError } from "../presentation/research-content";
export function poseError(value: unknown, zh: boolean) {
  const message = String(value);
  if (/only 2D coordinates/i.test(message))
    return zh
      ? "此配体只有二维结构。请先生成三维构象并进行对接，再查看它在受体中的位置。"
      : "This ligand has only a 2D structure. Generate a 3D conformer and dock it before inspecting its position in this receptor.";
  if (/registered SDF\/MOL source/i.test(message))
    return zh
      ? "请先将分子保存或导入工作台，再准备可计算的三维构象。"
      : "Save or import the molecule into the workbench before preparing its calculated 3D conformer.";
  if (/transfer.*molecular constraints/i.test(message))
    return zh
      ? "这个姿势带有研究约束。请先确认新版本的约束，再进行优化；原 pose 已保留。"
      : "This pose has research constraints. Confirm them on the new version before optimization; the original pose is retained.";
  if (
    /environment.*unavailable|Install.*environment|not.*ready|image.*missing/i.test(
      message,
    )
  )
    return zh
      ? "请先在安装与组件中准备分子计算环境，再进行最小化。"
      : "Prepare the molecule compute environment in Installation & components first.";
  if (/3D SDF|2D drawing|existing.*pose|explicit chemical bonds/i.test(message))
    return zh
      ? "需要带正确化学键的三维 SDF/MOL。二维结构可先到分子准备生成三维构象。"
      : "Use a 3D SDF/MOL with correct bonds. Generate a conformer in Molecule preparation for a 2D drawing.";
  if (/parameters.*unavailable/i.test(message))
    return zh
      ? "当前力场缺少参数。可在最小化设置中选择 UFF 后重试。"
      : "Parameters are unavailable. You may explicitly select UFF in Minimization settings.";
  if (
    /Task execution failed|Scientific task exited|minimization did not succeed/i.test(
      message,
    )
  )
    return zh
      ? "最小化未完成，原 pose 已保留。请检查计算环境和输入的三维结构后重试。"
      : "Minimization did not finish; the original pose is retained. Check the compute environment and input geometry before retrying.";
  return researchError(message, zh);
}
