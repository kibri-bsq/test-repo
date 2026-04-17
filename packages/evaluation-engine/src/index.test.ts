import { describe, expect, it } from "vitest";
import { parseFormula } from "@engine/formula-parser";
import { InMemoryAggregateLookupStore, evaluateKpisForNode } from "./index";

describe("evaluation-engine", () => {
  it("produces per-kpi trace entries", () => {
    const runtimePlan = {
      planVersion: "1",
      kpiIds: ["Variance"],
      astByKpi: { Variance: parseFormula("Revenue[Scenario=Actual] - Revenue[Scenario=Budget]") },
      dependencyGraph: { nodes: ["Variance"], edges: { Variance: [] } },
      evaluationOrder: ["Variance"],
      validationSummary: { valid: true, errors: [] }
    } as any;

    const metadata = {
      dimensions: {
        Scenario: { id: "Scenario", label: "Scenario", type: "flat", ordered: false, hierarchy: false, members: ["Actual", "Budget"] }
      },
      measures: { Revenue: { id: "Revenue", label: "Revenue", aggregation: "sum" } },
      kpis: {
        Variance: {
          id: "Variance",
          label: "Variance",
          formula: "Revenue[Scenario=Actual] - Revenue[Scenario=Budget]",
          formulaType: "cross_member",
          dependencies: [],
          requiredDimensions: ["Scenario"],
          totalStrategy: "recompute",
          validAtLeaf: true,
          validAtSubtotal: true,
          validAtGrandTotal: true,
          missingValueBehavior: "warning",
          version: "1"
        }
      }
    } as any;

    const store = new InMemoryAggregateLookupStore();
    store.set({ byDimension: { Scenario: "Actual" } }, { Revenue: 100 });
    store.set({ byDimension: { Scenario: "Budget" } }, { Revenue: 90 });

    const node = {
      nodeKey: "x",
      rowPath: [],
      columnPath: [],
      context: { byDimension: { Scenario: "Actual" } },
      baseAggregates: { Revenue: 100 },
      kpis: {},
      nodeType: "leaf",
      suppressedKpis: [],
      warnings: [],
      missingReferences: [],
      contributingRecords: [],
      trace: []
    } as any;

    const out = evaluateKpisForNode(node, runtimePlan, metadata, store);
    expect(out.trace.some(t => t.kpiId === "Variance")).toBe(true);
  });
});
