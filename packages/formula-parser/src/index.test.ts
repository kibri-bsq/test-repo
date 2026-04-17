import { describe, expect, it } from "vitest";
import { parseFormula } from "./index";

describe("formula-parser", () => {
  it("parses contextual references and functions", () => {
    expect(parseFormula("Revenue[Scenario=Budget]").kind).toBe("contextualReference");
    expect(parseFormula("ABS(5)").kind).toBe("functionCall");
  });
});
