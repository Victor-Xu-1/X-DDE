import type { Language } from "../types";
import type { PreparedExample } from "./types";

export function DatasetStudyInputPreview({
  example,
  language,
}: {
  example: PreparedExample;
  language: Language;
}) {
  const zh = language === "zh";
  return (
    <section
      className="research-table-scroll"
      aria-label={zh ? "DEL 实验材料" : "DEL experimental inputs"}
    >
      <table className="research-table">
        <thead>
          <tr>
            <th>{zh ? "研究材料" : "Study material"}</th>
            <th>{zh ? "内容与用途" : "Contents and use"}</th>
            <th>{zh ? "文件大小" : "Size"}</th>
            <th>{zh ? "原始文件" : "Source file"}</th>
          </tr>
        </thead>
        <tbody>
          {example.study?.materials?.map((material) => (
            <tr key={material.name}>
              <th scope="row">{material.name}</th>
              <td>{material.description[zh ? 0 : 1]}</td>
              <td>
                {(material.bytes / 1024 ** 2).toLocaleString(
                  zh ? "zh-CN" : "en-US",
                  {
                    maximumFractionDigits: 2,
                  },
                )}{" "}
                MiB
              </td>
              <td>
                <a
                  className="text-button"
                  href={material.url}
                  download
                  aria-label={(zh ? "下载 " : "Download ") + material.name}
                >
                  {zh ? "下载" : "Download"}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
