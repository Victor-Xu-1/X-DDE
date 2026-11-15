export interface Ketcher {
  structService?: {
    dearomatize?(
      data: { struct: string; output_format: "chemical/x-mdl-molfile" },
      options: { "aromaticity-model": "generic" },
    ): Promise<{ struct: string }>;
    layout?(data: {
      struct: string;
      output_format: "chemical/x-indigo-ket" | "chemical/x-mdl-molfile";
    }): Promise<{ struct: string }>;
    toggleExplicitHydrogens(data: {
      struct: string;
      mode: "fold";
      output_format: "chemical/x-indigo-ket";
    }): Promise<{ struct: string }>;
  };
  changeEvent?: {
    add(listener: () => void): void;
    remove(listener: () => void): void;
  };
  getKet?(): Promise<string>;
  editor?: { setOptions(options: string): unknown };
  generateImage?(
    data: string,
    options: {
      outputFormat: "svg";
      backgroundColor?: string;
      "render-font-size"?: number;
      "render-font-size-unit"?: "px" | "pt";
      "render-font-size-sub"?: number;
      "render-font-size-sub-unit"?: "px" | "pt";
      "render-bond-thickness"?: number;
      "render-bond-thickness-unit"?: "px" | "pt";
      "bond-length"?: number;
      "bond-length-unit"?: "px" | "pt";
      "image-resolution"?: number;
    },
  ): Promise<Blob>;
  getSmiles(): Promise<string>;
  getMolfile(): Promise<string>;
  setMolecule(value: string): Promise<void>;
  layout?(): Promise<void>;
  dearomatize?(): Promise<void>;
}
