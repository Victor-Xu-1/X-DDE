import type { GLViewer, LabelSpec, XYZ } from "3dmol";
import { nativeAnnotationStyle, nativeLabelLayer } from "./native-labels";
export interface ContactLabel {
  text: string;
  position: XYZ;
}
const style: LabelSpec = {
  ...nativeAnnotationStyle,
  fontSize: 11,
  fontColor: "#324c62",
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
