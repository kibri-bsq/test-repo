import { describe, expect, it } from "vitest";
import { parseFormula } from "@engine/formula-parser";
import { buildPlacementPlanBundle } from "./index";

describe("placement-engine", () => {
  it("collapses scenario for variance when scenario is on columns", () => {
    const bundle = buildPlacementPlanBundle(
      { Variance: parseFormula("Revenue[Scenario=Actual] - Revenue[Scenario=Budget]") },
      {
        rowDimensions: ["Region"],
        columnDimensions: ["Product", "Scenario"],
        selectedKpis: ["Variance"],
        filters: [],
        totalOptions: { showRowTotals: true, showColumnTotals: true, showGrandTotal: true, rowSubtotalDimensions: [], columnSubtotalDimensions: [] },
        displayOptions: { includeDiagnostics: true }
      } as any,
      { dimensions: {}, measures: {}, kpis: {} } as any
    );
    expect(bundle.plans.Variance.collapsedDimensions).toContain("Scenario");
    expect(bundle.plans.Variance.displayInjection.type).toBe("derived_column");
  });
});
