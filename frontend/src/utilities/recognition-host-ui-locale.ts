/** Native recognition UI companion. Translate React labels, never chemical data. */
import { useEffect, useState } from "react";
import {
  attachRecognitionLocaleHost,
  recognitionLanguage,
} from "./recognition-locale";

const english: Record<string, string> = {
  "结构已更新，请核对后重试。": "Drawing changed. Review it and try again.",
  "正在准备分子结构…": "Preparing structure…",
  "绘图备份已保留。": "A drawing backup was retained.",
  "请重新载入分子结构。": "Reload a molecular structure.",
  整理为二维结构: "Prepare 2D drawing",
  下载绘图备份: "Download drawing backup",
  "无法安全准备简洁视图，已保留原始结构。":
    "The simplified view could not be prepared safely. The original structure was retained.",
  "无法应用分子显示规则，请更新绘图组件。":
    "The molecular display could not be configured. Update the drawing component.",
  识别服务已关闭: "Recognition is off",
  正在启动: "Starting",
  模型加载中: "Loading model",
  识别服务就绪: "Recognition is ready",
  识别中: "Recognizing",
  正在关闭: "Stopping",
  服务异常: "Service unavailable",
  图片识别: "Image recognition",
  识别后端: "Recognition service",
  关闭识别后端: "Stop recognition service",
  启动识别后端: "Start recognition service",
  关闭提示: "Dismiss message",
  结构图片: "Structure image",
  粘贴: "Paste",
  上传: "Upload",
  清空图片: "Clear image",
  待识别的化学结构图片: "Chemical structure image to recognize",
  选择图片: "Choose image",
  未选择图片: "No image selected",
  缩小图片: "Zoom out",
  放大图片: "Zoom in",
  适应画布: "Fit image",
  示例图片: "Example image",
  阿司匹林示例: "Aspirin example",
  咖啡因示例: "Caffeine example",
  开始识别: "Recognize image",
  分子结构: "Molecular structure",
  结构编辑器加载中: "Loading structure editor",
  "当前结构的 SMILES": "Current structure SMILES",
  "复制当前 SMILES": "Copy current SMILES",
  "复制 SMILES": "Copy SMILES",
  "复制 MOL": "Copy MOL",
  "下载 SMILES": "Download SMILES",
  "下载 SDF": "Download SDF",
  "下载 MOL V3000": "Download MOL V3000",
  "请用 MOL V3000 保留此结构的扩展注释或相对手性。": "MOL V3000 preserves this structure's extended annotations or relative stereochemistry.",
  "此结构含扩展注释或相对手性，请下载 MOL V3000 保留完整结构。": "Download MOL V3000 to preserve the extended annotations or relative stereochemistry of this structure.",
  "无法生成可回读的单行 SMILES，请下载 MOL V3000。": "A readable single-line SMILES could not be generated. Download MOL V3000.",
  "无法核对 SMILES 的结构与立体化学，请下载 MOL V3000。": "The structure and stereochemistry of this SMILES could not be verified. Download MOL V3000.",
  "无法核对原始立体化学，已停止导出。":
    "The original stereochemistry could not be verified. Export was stopped.",
  "在 ChemDraw 中使用「编辑 → 选择性粘贴 → SMILES」。": "In ChemDraw, use Edit → Paste Special → SMILES.",
  "编辑器无法载入此结构。可复制识别结果的 SMILES 或下载 MOL。":
    "The editor could not load this structure. Copy the recognized SMILES or download the MOL file.",
  "已保留识别结果的双键构型，可复制 SMILES 到 ChemDraw。":
    "Copy the verified SMILES to ChemDraw to retain the recognized double-bond geometry.",
  "无法核对双键构型，已停止导出。":
    "The double-bond configuration could not be verified. Export is unavailable.",
  "编辑器无法载入此结构。请下载识别结果的 MOL 文件。":
    "The editor could not load this structure. Download the recognized MOL file.",
  "绘图组件无法核对原始 SMILES 的立体化学。":
    "The editor cannot verify the stereochemistry of the original SMILES.",
  "可复制原始 SMILES，在 ChemDraw 中核对累积双键构型。":
    "Copy the original SMILES and check the allene configuration in ChemDraw.",
  "累积双键手性与扩展注释无法安全导出。":
    "The allene stereochemistry and extended annotations cannot be exported safely.",
  "下载识别结果 MOL": "Download recognized MOL",
  "识别结果的 SMILES": "SMILES from recognition",
  本地运行: "Runs locally",
  "关闭识别后端？": "Stop recognition service?",
  "正在运行的识别任务会被中断。":
    "The current recognition task will be interrupted.",
  返回: "Back",
  关闭后端: "Stop service",
  结构编辑器未能加载: "Structure editor could not load",
  重新加载: "Reload",
  "结构编辑器无法载入该分子。":
    "The structure editor could not load this molecule.",
  "未能识别该图片。": "This image could not be recognized.",
  "与本地页面服务的连接已中断。": "Connection to the local workbench was lost.",
  "无法连接本地页面服务。": "Cannot connect to the local workbench.",
  "本地请求失败。": "The local request failed.",
  "当前任务正在识别。": "An image is being recognized.",
  "图片超过 10 MB。": "The image exceeds 10 MB.",
  "请选择 PNG、JPEG、WebP 或 BMP 图片。":
    "Choose a PNG, JPEG, WebP or BMP image.",
  "图片超过 2000 万像素。": "The image exceeds 20 million pixels.",
  "无法读取图片。": "The image could not be read.",
  "示例图片暂不可用。": "The example image is unavailable.",
  "剪贴板中没有图片。": "There is no image in the clipboard.",
  "无法读取剪贴板，请使用粘贴操作或选择图片文件。":
    "Paste an image or choose an image file.",
  "当前结构为空。": "The structure is empty.",
  "SMILES 已复制": "SMILES copied",
  "SMILES 已复制。在 ChemDraw 中选择性粘贴为 SMILES。":
    "SMILES copied. In ChemDraw, use Paste Special → SMILES.",
  "MOL 已复制": "MOL copied",
  "复制失败，请检查剪贴板权限。": "Copy failed. Check clipboard permission.",
  "结构导出失败。": "The structure could not be exported.",
  "图片为空。": "The image is empty.",
  "任务不存在或已被清除。": "The task is unavailable.",
  "识别服务启动失败，请查看本地日志。":
    "Recognition could not start. Check the local service.",
  "识别服务关闭失败，请查看本地日志。":
    "Recognition could not stop. Check the local service.",
  "模型加载失败。": "The recognition model could not load.",
  "模型启动超时，识别服务已关闭。":
    "Model startup timed out. Recognition was stopped.",
  "识别超时，识别服务已关闭。":
    "Recognition timed out. The service was stopped.",
  "识别服务连接中断，已关闭后端。":
    "Recognition lost its connection and was stopped.",
  "DECIMER 模型加载失败，请查看本地服务日志。":
    "The recognition model could not load. Check the local service.",
  "识别服务尚未就绪。": "Recognition is not ready yet.",
  "已有识别任务正在运行。": "A recognition task is already running.",
  "识别失败，请重试或更换更清晰的结构图片。":
    "Recognition failed. Retry or use a clearer structure image.",
  "图片为空或超过 10 MB。": "The image is empty or exceeds 10 MB.",
  "不支持该图片格式。": "This image format is unsupported.",
  "图片尺寸过小。": "The image is too small.",
  "图片为空白或没有可辨识内容。":
    "The image is blank or has no recognizable content.",
  "无法读取图片，或图片尺寸不安全。":
    "The image cannot be read or its dimensions exceed safe limits.",
  "识别结果不是有效的 SMILES，未生成分子结构。":
    "The recognized SMILES is invalid. No molecular structure was created.",
};

export function recognitionHostText(value: string, language: "en" | "zh") {
  return language === "zh" ? value : (english[value] ?? value);
}

export function useRecognitionHostLanguage() {
  const [{ language, requested }, setLocale] = useState(() => {
    const explicit = recognitionLanguage(
      new URLSearchParams(location.search).get("lang"),
    );
    return { language: explicit ?? "zh", requested: explicit !== null };
  });
  useEffect(
    () =>
      attachRecognitionLocaleHost((language) =>
        setLocale({ language, requested: true }),
      ),
    [],
  );
  useEffect(() => {
    if (!requested) return;
    document.documentElement.lang = language;
    document.title = recognitionHostText("图片识别", language) + " · DECIMER";
  }, [language, requested]);
  return {
    language,
    text: (value: string) => recognitionHostText(value, language),
  };
}
