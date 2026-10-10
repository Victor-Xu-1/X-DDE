import type { GLViewer, LabelSpec, XYZ } from "3dmol";
import { nativeLabelLayer } from "./native-labels";
export interface ContactLabel {
  text: string;
  position: XYZ;
}
const style: LabelSpec = {
  fontSize: 11,
  fontColor: "#324c62",
  backgroundColor: "white",
  backgroundOpacity: 0.92,
  showBackground: true,
  inFront: true,
  alignment: "topLeft",
};
/** Contact appearance; lifecycle, typography and placement have one owner. */
export function addContactLabels(viewer: GLViewer, rows: ContactLabel[]) {
  for (const row of rows)
    nativeLabelLayer(viewer).add(
      row.text,
      { ...style, position: row.position },
      undefined,
      true,
    );
}
