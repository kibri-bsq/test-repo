import type { ViewRequest, DimensionId } from "@engine/contracts";
import type { MetadataBundle } from "@engine/engine-model";
import type { AstNode, ContextOverride } from "@engine/formula-parser";

export type DimensionRole = "passive" | "filtered" | "traversed" | "shifted" | "collapsed";

export interface PlacementDisplayInjection {
  type: "inside_cell" | "derived_column" | "derived_row";
  position: "same_cell" | "after_dimension" | "parallel_axis";
  anchorDimension?: DimensionId;
}

export interface KPIPlacementPlan {
  kpiId: string;
  placementType: "cell_local" | "axis_collapsed" | "axis_shifted" | "axis_relative";
  rowDimsUsed: DimensionId[];
  colDimsUsed: DimensionId[];
  collapsedDimensions: DimensionId[];
  dimensionRoles: Record<DimensionId, DimensionRole>;
  displayInjection: PlacementDisplayInjection;
  notes: string[];
}

export interface PlacementPlanBundle {
  plans: Record<string, KPIPlacementPlan>;
}

function roleFromOverride(override: ContextOverride): DimensionRole {
  if (override.value === "parent") return "traversed";
  if (override.value === "previous" || override.value === "next") return "shifted";
  if (override.value === "current") return "passive";
  return "filtered";
}

function collectOverrides(ast: AstNode, out: ContextOverride[] = []): ContextOverride[] {
  switch (ast.kind) {
    case "numberLiteral":
    case "identifier":
      return out;
    case "contextualReference":
      out.push(...ast.overrides);
      return out;
    case "binaryOperation":
      collectOverrides(ast.left, out);
      collectOverrides(ast.right, out);
      return out;
    case "functionCall":
      for (const arg of ast.args) collectOverrides(arg, out);
      return out;
  }
}

export function analyzeKPIPlacement(
  kpiId: string,
  ast: AstNode,
  request: ViewRequest,
  _metadata: MetadataBundle
): KPIPlacementPlan {
  const overrides = collectOverrides(ast);
  const dimensionRoles: Record<DimensionId, DimensionRole> = {};
  const axisDims = new Set([...request.rowDimensions, ...request.columnDimensions]);
  const collapsed = new Set<DimensionId>();
  const notes: string[] = [];

  for (const override of overrides) {
    const role = roleFromOverride(override);
    dimensionRoles[override.dimensionId] = role;
    if (axisDims.has(override.dimensionId) && role !== "passive") {
      collapsed.add(override.dimensionId);
      dimensionRoles[override.dimensionId] = "collapsed";
      notes.push(`${override.dimensionId} is present on the active axis and overridden by KPI formula, so it collapses for placement.`);
    }
  }

  const rowDimsUsed = request.rowDimensions.filter(d => !collapsed.has(d));
  const colDimsUsed = request.columnDimensions.filter(d => !collapsed.has(d));

  let placementType: KPIPlacementPlan["placementType"] = "cell_local";
  if (overrides.some(o => o.value === "parent")) placementType = "axis_relative";
  else if (overrides.some(o => o.value === "previous" || o.value === "next")) placementType = "axis_shifted";
  else if (collapsed.size > 0) placementType = "axis_collapsed";

  let displayInjection: PlacementDisplayInjection = { type: "inside_cell", position: "same_cell" };
  const collapsedCols = request.columnDimensions.filter(d => collapsed.has(d));
  const collapsedRows = request.rowDimensions.filter(d => collapsed.has(d));

  if (collapsedCols.length > 0) {
    displayInjection = { type: "derived_column", position: "after_dimension", anchorDimension: collapsedCols[collapsedCols.length - 1] };
  } else if (collapsedRows.length > 0) {
    displayInjection = { type: "derived_row", position: "after_dimension", anchorDimension: collapsedRows[collapsedRows.length - 1] };
  } else {
    notes.push("KPI does not override an active axis dimension, so it remains cell-local.");
  }

  return {
    kpiId,
    placementType,
    rowDimsUsed,
    colDimsUsed,
    collapsedDimensions: [...collapsed],
    dimensionRoles,
    displayInjection,
    notes
  };
}

export function buildPlacementPlanBundle(
  astByKpi: Record<string, AstNode>,
  request: ViewRequest,
  metadata: MetadataBundle
): PlacementPlanBundle {
  const plans: Record<string, KPIPlacementPlan> = {};
  for (const kpiId of request.selectedKpis) {
    const ast = astByKpi[kpiId];
    if (!ast) continue;
    plans[kpiId] = analyzeKPIPlacement(kpiId, ast, request, metadata);
  }
  return { plans };
}
