import type { BackendPayload, ViewRequest } from "@engine/contracts";
import type { MetadataBundle } from "@engine/engine-model";

const baseTotalOptions = {
  showRowTotals: true,
  showColumnTotals: true,
  showGrandTotal: true,
  rowSubtotalDimensions: ["Region", "Entity"],
  columnSubtotalDimensions: ["Month"]
};

export const examples = [
  {
    name: "Basic Margin + Variance",
    payload: {
      datasetId: "sales_analytics",
      datasetVersion: "1.0.0",
      sliceSignature: "example-a",
      extractedAt: "2026-04-17T00:00:00Z",
      records: [
        { Region: "South", Product: "A", Month: "Jan", Scenario: "Actual", Revenue: 1000, Cost: 700 },
        { Region: "South", Product: "A", Month: "Jan", Scenario: "Budget", Revenue: 900, Cost: 650 },
        { Region: "South", Product: "B", Month: "Jan", Scenario: "Actual", Revenue: 500, Cost: 200 },
        { Region: "South", Product: "B", Month: "Jan", Scenario: "Budget", Revenue: 450, Cost: 250 },
        { Region: "North", Product: "A", Month: "Jan", Scenario: "Actual", Revenue: 300, Cost: 100 },
        { Region: "North", Product: "A", Month: "Jan", Scenario: "Budget", Revenue: 250, Cost: 120 }
      ],
      fieldMap: {
        Region: "dim_region",
        Product: "dim_product",
        Month: "dim_month",
        Scenario: "dim_scenario",
        Revenue: "Revenue",
        Cost: "Cost"
      }
    } as BackendPayload,
    metadata: {
      schemaVersion: "1",
      dimensions: {
        Region: { id: "Region", label: "Region", type: "flat", ordered: false, hierarchy: false, members: ["South", "North"] },
        Product: { id: "Product", label: "Product", type: "flat", ordered: false, hierarchy: false, members: ["A", "B"] },
        Month: { id: "Month", label: "Month", type: "ordered", ordered: true, hierarchy: false, members: ["Jan"], ordering: ["Jan"] },
        Scenario: { id: "Scenario", label: "Scenario", type: "flat", ordered: false, hierarchy: false, members: ["Actual", "Budget"] }
      },
      measures: {
        Revenue: { id: "Revenue", label: "Revenue", aggregation: "sum" },
        Cost: { id: "Cost", label: "Cost", aggregation: "sum" }
      },
      kpis: {
        Margin: {
          id: "Margin",
          label: "Margin",
          formula: "Revenue - Cost",
          formulaType: "measure_based",
          dependencies: [],
          requiredDimensions: [],
          totalStrategy: "recompute",
          validAtLeaf: true,
          validAtSubtotal: true,
          validAtGrandTotal: true,
          missingValueBehavior: "null",
          version: "1"
        },
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
    } as MetadataBundle,
    request: {
      rowDimensions: ["Region", "Product"],
      columnDimensions: ["Month"],
      selectedKpis: ["Margin", "Variance"],
      filters: [],
      totalOptions: { ...baseTotalOptions, rowSubtotalDimensions: ["Region"] },
      displayOptions: { includeDiagnostics: true }
    } as ViewRequest
  },
  {
    name: "Margin + MarginPct",
    payload: {
      datasetId: "margin_ratio",
      datasetVersion: "1.0.0",
      sliceSignature: "example-b",
      extractedAt: "2026-04-17T00:00:00Z",
      records: [
        { Region: "South", Product: "A", Month: "Jan", Revenue: 100, Cost: 80 },
        { Region: "South", Product: "B", Month: "Jan", Revenue: 1000, Cost: 700 },
        { Region: "North", Product: "A", Month: "Jan", Revenue: 400, Cost: 260 }
      ],
      fieldMap: {
        Region: "dim_region",
        Product: "dim_product",
        Month: "dim_month",
        Revenue: "Revenue",
        Cost: "Cost"
      }
    } as BackendPayload,
    metadata: {
      schemaVersion: "1",
      dimensions: {
        Region: { id: "Region", label: "Region", type: "flat", ordered: false, hierarchy: false, members: ["South", "North"] },
        Product: { id: "Product", label: "Product", type: "flat", ordered: false, hierarchy: false, members: ["A", "B"] },
        Month: { id: "Month", label: "Month", type: "ordered", ordered: true, hierarchy: false, members: ["Jan"], ordering: ["Jan"] }
      },
      measures: {
        Revenue: { id: "Revenue", label: "Revenue", aggregation: "sum" },
        Cost: { id: "Cost", label: "Cost", aggregation: "sum" }
      },
      kpis: {
        Margin: {
          id: "Margin",
          label: "Margin",
          formula: "Revenue - Cost",
          formulaType: "measure_based",
          dependencies: [],
          requiredDimensions: [],
          totalStrategy: "recompute",
          validAtLeaf: true,
          validAtSubtotal: true,
          validAtGrandTotal: true,
          missingValueBehavior: "null",
          version: "1"
        },
        MarginPct: {
          id: "MarginPct",
          label: "Margin %",
          formula: "Margin / Revenue",
          formulaType: "measure_based",
          dependencies: ["Margin"],
          requiredDimensions: [],
          totalStrategy: "recompute",
          validAtLeaf: true,
          validAtSubtotal: true,
          validAtGrandTotal: true,
          missingValueBehavior: "warning",
          version: "1"
        }
      }
    } as MetadataBundle,
    request: {
      rowDimensions: ["Region", "Product"],
      columnDimensions: ["Month"],
      selectedKpis: ["Margin", "MarginPct"],
      filters: [],
      totalOptions: { ...baseTotalOptions, rowSubtotalDimensions: ["Region"] },
      displayOptions: { includeDiagnostics: true }
    } as ViewRequest
  },
  {
    name: "Parent Contribution",
    payload: {
      datasetId: "entity_hierarchy",
      datasetVersion: "1.0.0",
      sliceSignature: "example-parent",
      extractedAt: "2026-04-17T00:00:00Z",
      records: [
        { Entity: "A", Month: "Jan", Revenue: 100, Cost: 40 },
        { Entity: "South", Month: "Jan", Revenue: 300, Cost: 160 },
        { Entity: "B", Month: "Jan", Revenue: 200, Cost: 120 }
      ],
      fieldMap: { Entity: "dim_entity", Month: "dim_month", Revenue: "Revenue", Cost: "Cost" }
    } as BackendPayload,
    metadata: {
      schemaVersion: "1",
      dimensions: {
        Entity: {
          id: "Entity",
          label: "Entity",
          type: "hierarchical",
          ordered: false,
          hierarchy: true,
          members: ["South", "A", "B"],
          parentByMember: { A: "South", B: "South", South: null }
        },
        Month: { id: "Month", label: "Month", type: "ordered", ordered: true, hierarchy: false, members: ["Jan"], ordering: ["Jan"] }
      },
      measures: {
        Revenue: { id: "Revenue", label: "Revenue", aggregation: "sum" },
        Cost: { id: "Cost", label: "Cost", aggregation: "sum" }
      },
      kpis: {
        ContributionPct: {
          id: "ContributionPct",
          label: "Contribution %",
          formula: "Revenue / Revenue[Entity=parent]",
          formulaType: "context_relative",
          dependencies: [],
          requiredDimensions: ["Entity"],
          totalStrategy: "recompute",
          validAtLeaf: true,
          validAtSubtotal: true,
          validAtGrandTotal: false,
          missingValueBehavior: "warning",
          version: "1"
        }
      }
    } as MetadataBundle,
    request: {
      rowDimensions: ["Entity"],
      columnDimensions: ["Month"],
      selectedKpis: ["ContributionPct"],
      filters: [],
      totalOptions: { ...baseTotalOptions, rowSubtotalDimensions: ["Entity"] },
      displayOptions: { includeDiagnostics: true }
    } as ViewRequest
  },
  {
    name: "Month-over-Month Growth",
    payload: {
      datasetId: "mom_growth",
      datasetVersion: "1.0.0",
      sliceSignature: "example-previous",
      extractedAt: "2026-04-17T00:00:00Z",
      records: [
        { Product: "A", Month: "Jan", Revenue: 100, Cost: 50 },
        { Product: "A", Month: "Feb", Revenue: 130, Cost: 60 },
        { Product: "B", Month: "Jan", Revenue: 200, Cost: 90 },
        { Product: "B", Month: "Feb", Revenue: 180, Cost: 80 }
      ],
      fieldMap: { Product: "dim_product", Month: "dim_month", Revenue: "Revenue", Cost: "Cost" }
    } as BackendPayload,
    metadata: {
      schemaVersion: "1",
      dimensions: {
        Product: { id: "Product", label: "Product", type: "flat", ordered: false, hierarchy: false, members: ["A", "B"] },
        Month: { id: "Month", label: "Month", type: "ordered", ordered: true, hierarchy: false, members: ["Jan", "Feb"], ordering: ["Jan", "Feb"] }
      },
      measures: {
        Revenue: { id: "Revenue", label: "Revenue", aggregation: "sum" },
        Cost: { id: "Cost", label: "Cost", aggregation: "sum" }
      },
      kpis: {
        MoMGrowth: {
          id: "MoMGrowth",
          label: "MoM Growth",
          formula: "(Revenue - Revenue[Month=previous]) / Revenue[Month=previous]",
          formulaType: "time_relative",
          dependencies: [],
          requiredDimensions: ["Month"],
          totalStrategy: "recompute",
          validAtLeaf: true,
          validAtSubtotal: true,
          validAtGrandTotal: false,
          missingValueBehavior: "warning",
          version: "1"
        }
      }
    } as MetadataBundle,
    request: {
      rowDimensions: ["Product"],
      columnDimensions: ["Month"],
      selectedKpis: ["MoMGrowth"],
      filters: [],
      totalOptions: { ...baseTotalOptions, rowSubtotalDimensions: [], columnSubtotalDimensions: ["Month"] },
      displayOptions: { includeDiagnostics: true }
    } as ViewRequest
  }
];
