import { describe, expect, it } from "vitest";
import { parseFormula } from "@engine/formula-parser";
import { buildDependencyGraph, topologicallySortGraph } from "./index";

describe("dependency-graph", () => {
  it("orders dependent kpis", () => {
    const metadata = {
      schemaVersion: "1",
      dimensions: {},
      measures: { Revenue: { id: "Revenue", label: "Revenue", aggregation: "sum" } },
      kpis: {}
    } as any;
    const selected = [
      { id: "Margin", formula: "Revenue - Cost" },
      { id: "MarginPct", formula: "Margin / Revenue" }
    ] as any;
    const astByKpi = {
      Margin: parseFormula("Revenue - Cost"),
      MarginPct: parseFormula("Margin / Revenue")
    };
    const order = topologicallySortGraph(buildDependencyGraph(selected, astByKpi, metadata).graph);
    expect(order.indexOf("Margin")).toBeLessThan(order.indexOf("MarginPct"));
  });
});
