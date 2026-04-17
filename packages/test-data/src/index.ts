import type { BackendPayload, ViewRequest } from "@engine/contracts";
import type { MetadataBundle } from "@engine/engine-model";

const baseTotalOptions = {
  showRowTotals: true,
  showColumnTotals: true,
  showGrandTotal: true,
  rowSubtotalDimensions: ["Region", "Entity"],
  columnSubtotalDimensions: ["Month", "Scenario", "Product"]
};

function buildLargeVolumeExample() {
  const regions = ["North", "South", "East", "West"];
  const products = ["Alpha", "Beta", "Gamma", "Delta"];
  const channels = ["Online", "Retail", "Distributor"];
  const scenarios = ["Actual", "Budget"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"];
  const records: any[] = [];
  let i = 0;
  for (const region of regions) {
    for (const product of products) {
      for (const channel of channels) {
        for (const month of months) {
          for (const scenario of scenarios) {
            for (let store = 1; store <= 14; store++) {
              if (i >= 10000) break;
              const revenue = 1000 + i % 300 + regions.indexOf(region) * 120 + products.indexOf(product) * 75 + channels.indexOf(channel) * 40 + months.indexOf(month) * 55 + (scenario === "Actual" ? 80 : 0);
              const cost = Math.round(revenue * (0.58 + products.indexOf(product) * 0.02));
              records.push({
                Region: region,
                Product: product,
                Channel: channel,
                Month: month,
                Scenario: scenario,
                Store: `S${String(store).padStart(2, "0")}`,
                Revenue: revenue,
                Cost: cost
              });
              i += 1;
            }
          }
        }
      }
    }
  }

  return {
    name: "Large Volume 10,000 Rows",
    payload: {
      datasetId: "large_volume_10000",
      datasetVersion: "1.0.0",
      sliceSignature: "large-volume-10000",
      extractedAt: "2026-04-17T00:00:00Z",
      records,
      fieldMap: {
        Region: "dim_region",
        Product: "dim_product",
        Channel: "dim_channel",
        Month: "dim_month",
        Scenario: "dim_scenario",
        Store: "dim_store",
        Revenue: "Revenue",
        Cost: "Cost"
      }
    } as BackendPayload,
    metadata: {
      schemaVersion: "1",
      dimensions: {
        Region: { id: "Region", label: "Region", type: "flat", ordered: false, hierarchy: false, members: regions },
        Product: { id: "Product", label: "Product", type: "flat", ordered: false, hierarchy: false, members: products },
        Channel: { id: "Channel", label: "Channel", type: "flat", ordered: false, hierarchy: false, members: channels },
        Month: { id: "Month", label: "Month", type: "ordered", ordered: true, hierarchy: false, members: months, ordering: months },
        Scenario: { id: "Scenario", label: "Scenario", type: "flat", ordered: false, hierarchy: false, members: scenarios },
        Store: { id: "Store", label: "Store", type: "flat", ordered: false, hierarchy: false, members: [] }
      },
      measures: {
        Revenue: { id: "Revenue", label: "Revenue", aggregation: "sum" },
        Cost: { id: "Cost", label: "Cost", aggregation: "sum" }
      },
      kpis: {
        Margin: {
          id: "Margin", label: "Margin", formula: "Revenue - Cost", formulaType: "measure_based",
          dependencies: [], requiredDimensions: [], totalStrategy: "recompute",
          validAtLeaf: true, validAtSubtotal: true, validAtGrandTotal: true, missingValueBehavior: "null", version: "1"
        },
        Variance: {
          id: "Variance", label: "Variance", formula: "Revenue[Scenario=Actual] - Revenue[Scenario=Budget]", formulaType: "cross_member",
          dependencies: [], requiredDimensions: ["Scenario"], totalStrategy: "recompute",
          validAtLeaf: true, validAtSubtotal: true, validAtGrandTotal: true, missingValueBehavior: "warning", version: "1"
        }
      }
    } as MetadataBundle,
    request: {
      rowDimensions: ["Region", "Product"],
      columnDimensions: ["Month", "Scenario"],
      selectedKpis: ["Margin", "Variance"],
      filters: [],
      totalOptions: {
        showRowTotals: true,
        showColumnTotals: true,
        showGrandTotal: true,
        rowSubtotalDimensions: ["Region"],
        columnSubtotalDimensions: ["Month"]
      },
      displayOptions: { includeDiagnostics: true }
    } as ViewRequest
  };
}

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
      fieldMap: { Region: "dim_region", Product: "dim_product", Month: "dim_month", Scenario: "dim_scenario", Revenue: "Revenue", Cost: "Cost" }
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
          id: "Margin", label: "Margin", formula: "Revenue - Cost", formulaType: "measure_based",
          dependencies: [], requiredDimensions: [], totalStrategy: "recompute",
          validAtLeaf: true, validAtSubtotal: true, validAtGrandTotal: true, missingValueBehavior: "null", version: "1"
        },
        Variance: {
          id: "Variance", label: "Variance", formula: "Revenue[Scenario=Actual] - Revenue[Scenario=Budget]", formulaType: "cross_member",
          dependencies: [], requiredDimensions: ["Scenario"], totalStrategy: "recompute",
          validAtLeaf: true, validAtSubtotal: true, validAtGrandTotal: true, missingValueBehavior: "warning", version: "1"
        }
      }
    } as MetadataBundle,
    request: {
      rowDimensions: ["Region", "Product"],
      columnDimensions: ["Month"],
      selectedKpis: ["Margin", "Variance"],
      filters: [],
      totalOptions: { ...baseTotalOptions, rowSubtotalDimensions: ["Region"], columnSubtotalDimensions: ["Month"] },
      displayOptions: { includeDiagnostics: true }
    } as ViewRequest
  },
  {
    name: "Product × Scenario Variance Placement",
    payload: {
      datasetId: "product_scenario_variance",
      datasetVersion: "1.0.0",
      sliceSignature: "example-product-scenario-variance",
      extractedAt: "2026-04-17T00:00:00Z",
      records: [
        { Region: "North", Product: "Product A", Scenario: "Scenario A", Revenue: 1000, Cost: 600 },
        { Region: "North", Product: "Product A", Scenario: "Scenario B", Revenue: 900, Cost: 590 },
        { Region: "North", Product: "Product B", Scenario: "Scenario A", Revenue: 800, Cost: 500 },
        { Region: "North", Product: "Product B", Scenario: "Scenario B", Revenue: 700, Cost: 480 },
        { Region: "South", Product: "Product A", Scenario: "Scenario A", Revenue: 1200, Cost: 650 },
        { Region: "South", Product: "Product A", Scenario: "Scenario B", Revenue: 1100, Cost: 640 },
        { Region: "South", Product: "Product B", Scenario: "Scenario A", Revenue: 950, Cost: 560 },
        { Region: "South", Product: "Product B", Scenario: "Scenario B", Revenue: 870, Cost: 555 }
      ],
      fieldMap: { Region: "dim_region", Product: "dim_product", Scenario: "dim_scenario", Revenue: "Revenue", Cost: "Cost" }
    } as BackendPayload,
    metadata: {
      schemaVersion: "1",
      dimensions: {
        Region: { id: "Region", label: "Region", type: "flat", ordered: false, hierarchy: false, members: ["North", "South"] },
        Product: { id: "Product", label: "Product", type: "flat", ordered: false, hierarchy: false, members: ["Product A", "Product B"] },
        Scenario: { id: "Scenario", label: "Scenario", type: "flat", ordered: false, hierarchy: false, members: ["Scenario A", "Scenario B"] }
      },
      measures: {
        Revenue: { id: "Revenue", label: "Revenue", aggregation: "sum" },
        Cost: { id: "Cost", label: "Cost", aggregation: "sum" }
      },
      kpis: {
        Margin: {
          id: "Margin", label: "Margin", formula: "Revenue - Cost", formulaType: "measure_based",
          dependencies: [], requiredDimensions: [], totalStrategy: "recompute",
          validAtLeaf: true, validAtSubtotal: true, validAtGrandTotal: true, missingValueBehavior: "null", version: "1"
        },
        Variance: {
          id: "Variance", label: "Variance", formula: "Revenue[Scenario=Scenario A] - Revenue[Scenario=Scenario B]", formulaType: "cross_member",
          dependencies: [], requiredDimensions: ["Scenario"], totalStrategy: "recompute",
          validAtLeaf: true, validAtSubtotal: true, validAtGrandTotal: true, missingValueBehavior: "warning", version: "1"
        }
      }
    } as MetadataBundle,
    request: {
      rowDimensions: ["Region"],
      columnDimensions: ["Product", "Scenario"],
      selectedKpis: ["Margin", "Variance"],
      filters: [],
      totalOptions: {
        showRowTotals: true, showColumnTotals: true, showGrandTotal: true,
        rowSubtotalDimensions: ["Region"], columnSubtotalDimensions: ["Product"]
      },
      displayOptions: { includeDiagnostics: true }
    } as ViewRequest
  },
  buildLargeVolumeExample()
];
