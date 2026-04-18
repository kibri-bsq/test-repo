import { describe, expect, it } from "vitest";
import { parseFormula } from "./index";

describe("formula-parser", () => {
  it("parses contextual references and functions", () => {
    expect(parseFormula("Revenue[Scenario=Budget]").kind).toBe("contextualReference");
    expect(parseFormula("ABS(5)").kind).toBe("functionCall");
  });

  it("joins spaced member names in bracket overrides", () => {
    const ast = parseFormula("Revenue[Scenario=Scenario A] - Revenue[Scenario=Scenario B]") as any;
    expect(ast.kind).toBe("binaryOperation");
    expect(ast.left.overrides[0].value).toBe("Scenario A");
    expect(ast.right.overrides[0].value).toBe("Scenario B");
  });

  it("accepts quoted override values", () => {
    const ast = parseFormula("Revenue[Scenario=\"Scenario A\"]") as any;
    expect(ast.overrides[0].value).toBe("Scenario A");
  });
});
