import { DownloadOutlined } from "@ant-design/icons";
import type { Language } from "../types";

export function AssemblyFiles({
  complex,
  ligand,
  language,
}: {
  complex: string;
  ligand: string;
  language: Language;
}) {
  const zh = language === "zh";
  const files = [
    {
      href: complex,
      format: "PDB",
      label: zh ? "PDB · 下载完整复合物" : "PDB · Download complete complex",
    },
    {
      href: ligand,
      format: "SDF",
      label: zh ? "下载分子 SDF" : "Download molecule SDF",
    },
  ];
  return (
    <nav
      className="proximity-downloads"
      aria-label={zh ? "下载结构" : "Download structures"}
    >
      {files.map(({ href, format, label }) => (
        <a
          key={format}
          className="secondary-button"
          href={href}
          aria-label={label}
          title={label}
          download
        >
          <DownloadOutlined aria-hidden="true" />
          {format}
        </a>
      ))}
    </nav>
  );
}
