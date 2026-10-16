import { ReviewReference } from "../diffsbdd/ReviewReference";
import type { Language } from "../types";
import type { DefinedRegion } from "./types";

export function DefinedRegionReview({
  regions,
  language,
}: {
  regions: DefinedRegion[];
  language: Language;
}) {
  const zh = language === "zh";
  return (
    <div className="site-table-wrap">
      <table
        aria-label={zh ? "搜索区域与材料" : "Search regions and materials"}
      >
        <thead>
          <tr>
            <th>{zh ? "区域" : "Region"}</th>
            <th>{zh ? "受体" : "Receptor"}</th>
            <th>{zh ? "搜索条件" : "Search conditions"}</th>
          </tr>
        </thead>
        <tbody>
          {regions.map((region, index) => (
            <tr key={index}>
              <td>{region.label}</td>
              <td>
                <ReviewReference
                  reference={region.search.frame}
                  kind="structure"
                  language={language}
                />
              </td>
              <td>
                {region.search.kind === "reference_ligand" ? (
                  <>
                    <ReviewReference
                      reference={region.search.reference}
                      kind="ligand"
                      language={language}
                    />
                    <br />
                    {zh ? "坐标系已确认" : "Coordinate frame confirmed"}
                  </>
                ) : (
                  <>
                    {zh ? "中心" : "Center"}:{" "}
                    {region.search.box.center.join(", ")} Å<br />
                    {zh ? "边长" : "Lengths"}:{" "}
                    {region.search.box.size.join(" × ")} Å
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
