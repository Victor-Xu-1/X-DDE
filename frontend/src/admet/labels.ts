import type { Endpoint } from "./types";

const names: Record<string, string> = {
  HIA_Hou: "肠道吸收",
  Bioavailability_Ma: "口服生物利用度",
  Solubility_AqSolDB: "水溶解度",
  Lipophilicity_AstraZeneca: "脂溶性",
  HydrationFreeEnergy_FreeSolv: "水合自由能",
  Caco2_Wang: "Caco-2 通透性",
  PAMPA_NCATS: "PAMPA 通透性",
  Pgp_Broccatelli: "P-gp 抑制",
  BBB_Martins: "血脑屏障穿透",
  PPBR_AZ: "血浆蛋白结合率",
  VDss_Lombardo: "稳态分布容积",
  Half_Life_Obach: "半衰期",
  Clearance_Hepatocyte_AZ: "肝细胞清除率",
  Clearance_Microsome_AZ: "肝微粒体清除率",
  CYP1A2_Veith: "CYP1A2 抑制",
  CYP2C19_Veith: "CYP2C19 抑制",
  CYP2C9_Veith: "CYP2C9 抑制",
  CYP2D6_Veith: "CYP2D6 抑制",
  CYP3A4_Veith: "CYP3A4 抑制",
  CYP2C9_Substrate_CarbonMangels: "CYP2C9 底物",
  CYP2D6_Substrate_CarbonMangels: "CYP2D6 底物",
  CYP3A4_Substrate_CarbonMangels: "CYP3A4 底物",
  hERG: "hERG 阻断",
  ClinTox: "ClinTox 分类",
  AMES: "Ames 致突变",
  DILI: "药物性肝损伤",
  Carcinogens_Lagunin: "致癌性分类",
  LD50_Zhu: "急性毒性 LD50",
  Skin_Reaction: "皮肤反应",
  "NR-AR": "雄激素受体作用",
  "NR-AR-LBD": "雄激素受体结合域作用",
  "NR-AhR": "芳烃受体作用",
  "NR-Aromatase": "芳香化酶作用",
  "NR-ER": "雌激素受体作用",
  "NR-ER-LBD": "雌激素受体结合域作用",
  "NR-PPAR-gamma": "PPARγ 作用",
  "SR-ARE": "抗氧化应答",
  "SR-ATAD5": "ATAD5 应答",
  "SR-HSE": "热休克应答",
  "SR-MMP": "线粒体膜电位",
  "SR-p53": "p53 应答",
};
export const categoryLabels: Record<string, string> = {
  Absorption: "吸收",
  Distribution: "分布",
  Metabolism: "代谢",
  Excretion: "排泄",
  Toxicity: "早期安全性",
};
export const commonEndpoints = new Set([
  "Solubility_AqSolDB",
  "Lipophilicity_AstraZeneca",
  "Caco2_Wang",
  "PAMPA_NCATS",
  "BBB_Martins",
  "PPBR_AZ",
  "hERG",
  "AMES",
  "DILI",
]);
export function endpointName(e: Endpoint, zh: boolean) {
  return zh ? (names[e.id] ?? e.name) : e.name;
}
export function endpointUnit(e: Endpoint, zh: boolean) {
  return e.task_type === "classification"
    ? zh
      ? "分数 0–1"
      : "Score 0–1"
    : e.unit;
}
export function speciesName(species: string, zh: boolean) {
  return zh
    ? ((
        {
          human: "人",
          rat: "大鼠",
          "artificial membrane": "人工膜",
          "salmonella typhimurium": "鼠伤寒沙门菌",
          "-": "不适用",
        } as Record<string, string>
      )[species] ?? species)
    : species === "-"
      ? "Not applicable"
      : species;
}
export function endpointHint(e: Endpoint, zh: boolean) {
  const positive: Record<string, [string, string]> = {
    PAMPA_NCATS: [
      "原始标签 1 表示高通透性。",
      "Native label1 means high permeability.",
    ],
    hERG: ["原始标签 1 表示阻断 hERG。", "Native label1 means hERG blockade."],
    AMES: ["原始标签 1 表示致突变。", "Native label1 means mutagenicity."],
    DILI: [
      "原始标签 1 表示肝损伤关联。",
      "Native label1 indicates liver-injury association.",
    ],
  };
  let text =
    e.task_type === "classification"
      ? (positive[e.id]?.[zh ? 0 : 1] ??
        (zh
          ? "原始训练标签 1 的模型分数；高低含义请核对来源。"
          : "Model score for native label1; check the source for its meaning."))
      : zh
        ? "使用原始训练单位；不是指定条件下的实测数值。"
        : "Uses native training units, not a measurement under specified conditions.";
  if ((e.reference_metrics["R^2"] ?? 0) < 0)
    text += zh
      ? "上游版本的参考 R² 为负，请谨慎使用这一终点。"
      : "Upstream reference R² is negative; use this endpoint cautiously.";
  return text;
}
export function failureReason(reason: string | null, zh: boolean) {
  const labels: Record<string, [string, string]> = {
    invalid_sdf_record: ["文件记录无法解析", "Record cannot be parsed"],
    heavy_atom_limit: ["超出分子大小范围", "Outside molecular-size bounds"],
    disconnected_components_require_preparation: [
      "多成分结构需先准备",
      "Prepare disconnected components first",
    ],
    unsupported_model_representation: [
      "无法建立模型输入",
      "Model representation unavailable",
    ],
    native_prediction_unavailable: [
      "模型未得到有效预测",
      "Native model prediction unavailable",
    ],
  };
  return (
    labels[reason ?? ""]?.[zh ? 0 : 1] ??
    (zh ? "此记录暂未得到有效预测" : "Prediction unavailable for this record")
  );
}
