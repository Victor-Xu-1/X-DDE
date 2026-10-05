import { researchError } from "../presentation/research-content";
export function poseError(value: unknown, zh: boolean) {
  const message = String(value);
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
