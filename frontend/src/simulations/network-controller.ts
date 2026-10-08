import cytoscape, { type Core } from "cytoscape";
import type { FreeEnergyResult } from "./types";

export function createNetwork(
  container: HTMLElement,
  result: FreeEnergyResult,
  select: (id: string) => void,
): Core {
  const cy = cytoscape({
    container,
    minZoom: 0.4,
    maxZoom: 4,
    wheelSensitivity: 0.2,
    elements: [
      ...result.nodes.map((n) => ({
        data: { id: "node:" + n.id, label: n.id },
      })),
      ...result.edges.map((e) => ({
        data: {
          id: e.id,
          source: "node:" + e.a,
          target: "node:" + e.b,
          label:
            e.delta_delta_g_kcal_mol == null
              ? ""
              : e.delta_delta_g_kcal_mol.toFixed(2) + " kcal/mol",
        },
      })),
    ],
    layout: { name: "circle", padding: 44 },
    style: [
      {
        selector: "node",
        style: {
          "background-color": "#f0f3ff",
          "border-color": "#7181d7",
          "border-width": 2,
          width: 46,
          height: 46,
          label: "data(label)",
          "font-size": 11,
          "text-valign": "bottom",
          "text-margin-y": 10,
          color: "#485878",
        },
      },
      {
        selector: "edge",
        style: {
          width: 2,
          "line-color": "#b5c2da",
          "target-arrow-color": "#b5c2da",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          label: "data(label)",
          "font-size": 10,
          "text-background-color": "#ffffff",
          "text-background-opacity": 0.9,
          "text-background-padding": "3px",
          color: "#546379",
        },
      },
      {
        selector: ".active",
        style: {
          "background-color": "#dff5f0",
          "border-color": "#18998b",
          "line-color": "#18998b",
          "target-arrow-color": "#18998b",
        },
      },
      { selector: "edge.active", style: { width: 4 } },
    ],
  });
  cy.on("tap", "edge", (event) => select(event.target.id()));
  cy.on("tap", "node", (event) => {
    const id = event.target.id().slice(5);
    const edge = result.edges.find((e) => e.a === id || e.b === id);
    if (edge) select(edge.id);
  });
  return cy;
}

export function selectNetworkEdge(
  cy: Core,
  result: FreeEnergyResult,
  id: string,
) {
  cy.elements().removeClass("active");
  const edge = result.edges.find((e) => e.id === id);
  if (!edge) return;
  cy.getElementById(id).addClass("active");
  for (const node of [edge.a, edge.b])
    cy.getElementById("node:" + node).addClass("active");
}
