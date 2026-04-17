import { describe, expect, it } from "vitest";
import { executeView } from "./index";
import { examples } from "@engine/test-data";

describe("execution-engine", () => {
  it("returns matrix cells with explainability and trace", () => {
    const ex = examples[0];
    const out = executeView(ex.request, ex.payload, ex.metadata);
    expect(out.matrix.cells.length).toBeGreaterThan(0);
    expect(out.matrix.cells[0].explainability.executionTrace.length).toBeGreaterThan(0);
  });
});
