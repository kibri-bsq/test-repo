import { describe, expect, it } from "vitest";
import { aggregateRequest } from "./index";
import { examples } from "@engine/test-data";

describe("aggregation-engine", () => {
  it("stores drill-through records and totals", () => {
    const ex = examples[0];
    const out = aggregateRequest(ex.request, ex.payload, ex.metadata);
    expect([...out.nodes.values()].some(n => n.nodeType === "grandTotal")).toBe(true);
    expect([...out.nodes.values()].find(n => n.nodeType === "leaf").contributingRecords.length).toBeGreaterThan(0);
  });
});
