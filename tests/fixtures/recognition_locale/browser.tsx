/** Controlled browser contract fixture; NOT the native Ketcher/OCR workbench. */
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { ImageRecognition } from "../../../frontend/src/utilities/ImageRecognition";
import { useRecognitionHostLanguage } from "../../../frontend/src/utilities/recognition-host-ui-locale";

function Parent() {
  const [language, setLanguage] = useState<"en" | "zh">("en");
  return (
    <main style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <button onClick={() => setLanguage(language === "en" ? "zh" : "en")}>
        Switch language
      </button>
      <ImageRecognition language={language} />
    </main>
  );
}
function NativeLocaleContract() {
  const { text } = useRecognitionHostLanguage();
  const [image, setImage] = useState("");
  return (
    <main>
      <h1>{text("图片识别")}</h1>
      <p>{text("识别服务已关闭")}</p>
      <label>
        {text("结构图片")}
        <input
          type="file"
          onChange={(event) => setImage(event.target.files?.[0]?.name ?? "")}
        />
      </label>
      <p>{image}</p>
      <label>
        {text("分子结构")}
        <textarea defaultValue="controlled graph; not a recognized result" />
      </label>
      <button disabled>{text("开始识别")}</button>
      <p>{text("图片超过 10 MB。")}</p>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  location.port === "8940" ? <NativeLocaleContract /> : <Parent />,
);
