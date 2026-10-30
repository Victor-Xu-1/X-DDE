import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ScientificReview } from "./ScientificReview";

afterEach(cleanup);

it.each(["en", "zh"] as const)(
  "states the native binder sampling limitation before submission in %s",
  (language) => {
    const props = {
      language,
      inputs: [
        {
          role: "structure" as const,
          source: {
            asset_id: "target-original",
            sha256: "a".repeat(64),
            record: 0,
            conformer: 0,
          },
        },
      ],
      payload: {
        kind: "boltzgen" as const,
        modality: "protein",
        target_chains: ["A", "C"],
        candidates: 2,
        retain: 2,
        length: [70, 90],
      },
      options: { device: "cuda" as const, cpu: 1, memory_mib: 6144, seed: 101 },
    };
    const { rerender } = render(
      <ScientificReview {...props} program="boltzgen" />,
    );
    const limitation =
      language === "en"
        ? /does not support seed-controlled replay/
        : /不支持用随机种子重现采样/;
    expect(screen.getByText(limitation)).toBeVisible();
    const table = screen.getByRole("table", {
      name: language === "en" ? "Binder design plan" : "结合体设计方案",
    });
    expect(table).toHaveTextContent("GPU · 1 CPU · 6144 MiB");
    expect(table).toHaveTextContent("A, C");
    expect(table).toHaveTextContent(
      language === "en" ? "2 generated · 2 retained" : "生成 2 个 · 保留 2 个",
    );
    expect(table).toHaveTextContent(
      language === "en" ? "70–90 residues" : "70–90 个残基",
    );
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/api/assets/target-original",
    );
    expect(screen.getByRole("link")).toHaveAttribute("download");
    rerender(
      <ScientificReview
        {...props}
        program="boltzgen"
        payload={{ ...props.payload, candidates: 4, length: [90, 100] }}
        options={{ ...props.options, memory_mib: 4096 }}
      />,
    );
    expect(table).toHaveTextContent(
      language === "en" ? "4 generated · 2 retained" : "生成 4 个 · 保留 2 个",
    );
    expect(table).toHaveTextContent("90–100");
    expect(table).toHaveTextContent("4096 MiB");
    expect(table).not.toHaveTextContent("6144 MiB");
    // The restriction belongs to this engine, not all scientific programs.
    rerender(
      <ScientificReview
        {...props}
        program="ligandmpnn"
        payload={{ kind: "ligandmpnn", candidates: 2 }}
      />,
    );
    expect(screen.queryByText(limitation)).not.toBeInTheDocument();
  },
);

it.each(["antibody", "nanobody"])(
  "reviews the actual %s framework scope rather than an unused free-length range",
  (modality) => {
    const source = {
      asset_id: "framework-original",
      sha256: "b".repeat(64),
      record: 0,
      conformer: 0,
    };
    render(
      <ScientificReview
        program="boltzgen"
        language="en"
        inputs={[{ role: "scaffold", source }]}
        payload={{
          kind: "boltzgen",
          modality,
          candidates: 2,
          retain: 1,
          length: [80, 120],
          scaffold_chain: "H",
          scaffold_residues: ["H31", "H32", "H33"],
        }}
        options={{ device: "cuda", cpu: 1, memory_mib: 6144, seed: 101 }}
      />,
    );
    expect(screen.getByRole("table")).toHaveTextContent(
      "Framework chain H · 3 design positions",
    );
    expect(screen.getByRole("table")).not.toHaveTextContent("80–120");
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/api/assets/framework-original",
    );
  },
);
