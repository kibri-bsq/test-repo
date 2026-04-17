import type { BackendPayload, ExecutionResultContract, ExplainabilityContract, KpiCellStatus, RendererCell, RendererMatrix, ViewRequest } from "@engine/contracts";
import type { MetadataBundle, RuntimePlan } from "@engine/engine-model";
import { buildDependencyGraph, topologicallySortGraph } from "@engine/dependency-graph";
import { parseFormula } from "@engine/formula-parser";
import { aggregateRequest } from "@engine/aggregation-engine";
import { InMemoryAggregateLookupStore, evaluateKpisForNode } from "@engine/evaluation-engine";

export function buildRuntimePlan(request: ViewRequest, metadata: MetadataBundle): RuntimePlan {
  const selected = request.selectedKpis.map(id => metadata.kpis[id]).filter(Boolean);
  const astByKpi = Object.fromEntries(selected.map(k => [k.id, parseFormula(k.formula)]));
  const { graph } = buildDependencyGraph(selected, astByKpi, metadata);
  const evaluationOrder = topologicallySortGraph(graph);
  return {
    planVersion: selected.map(k => `${k.id}:${k.version}`).join("|"),
    kpiIds: selected.map(k => k.id),
    astByKpi,
    dependencyGraph: graph,
    evaluationOrder,
    validationSummary: { valid: true, errors: [] }
  };
}

function buildAggregateLookup(nodes: Map<string, any>) {
  const store = new InMemoryAggregateLookupStore();
  for (const node of nodes.values()) {
    if (Object.keys(node.context.byDimension).length > 0) {
      store.set(node.context, node.baseAggregates);
    }
  }
  return store;
}

function statusForKpi(node: any, kpiId: string): KpiCellStatus {
  if (node.suppressedKpis.includes(kpiId)) {
    return {
      displayState: "suppressed",
      reasons: [{ code: "suppressed_by_totalability", message: `${kpiId} is not valid at this node level` }]
    };
  }
  if (node.kpis[kpiId] == null) {
    const missing = node.missingReferences.some((r: any) => r.kpiId === kpiId || r.referenceName);
    return {
      displayState: missing ? "warning" : "null",
      reasons: missing
        ? [{ code: "missing_reference", message: "Alternate-context value could not be resolved" }]
        : [{ code: "null_value", message: "Value is null under current evaluation rules" }]
    };
  }
  return { displayState: "normal", reasons: [] };
}

function buildExplainability(node: any, request: ViewRequest, metadata: MetadataBundle): ExplainabilityContract {
  const formulasByKpi: Record<string, string> = {};
  for (const kpiId of request.selectedKpis) {
    formulasByKpi[kpiId] = metadata.kpis[kpiId]?.formula ?? "";
  }

  const values: Record<string, number | null> = { ...node.baseAggregates };
  for (const kpiId of request.selectedKpis) values[kpiId] = node.kpis[kpiId] ?? null;

  const statusByKpi: Record<string, KpiCellStatus> = {};
  for (const kpiId of request.selectedKpis) statusByKpi[kpiId] = statusForKpi(node, kpiId);

  return {
    nodeKey: node.nodeKey,
    rowPath: node.rowPath,
    columnPath: node.columnPath,
    nodeType: node.nodeType,
    context: node.context.byDimension,
    formulasByKpi,
    statusByKpi,
    warnings: node.warnings,
    missingReferences: node.missingReferences,
    values,
    contributingRecords: node.contributingRecords,
    executionTrace: node.trace
  };
}

function assembleRendererMatrix(evaluatedNodes: Map<string, any>, request: ViewRequest, metadata: MetadataBundle): RendererMatrix {
  const rowHeaders: string[][] = [];
  const columnHeaders: string[][] = [];
  const cells: RendererCell[] = [];
  const seenRows = new Set<string>();
  const seenCols = new Set<string>();

  for (const node of evaluatedNodes.values()) {
    const rKey = node.rowPath.join("|");
    const cKey = node.columnPath.join("|");
    if (!seenRows.has(rKey)) { seenRows.add(rKey); rowHeaders.push(node.rowPath); }
    if (!seenCols.has(cKey)) { seenCols.add(cKey); columnHeaders.push(node.columnPath); }

    const values: Record<string, number | null> = { ...node.baseAggregates };
    for (const kpiId of request.selectedKpis) values[kpiId] = node.kpis[kpiId] ?? null;

    const statusByKpi: Record<string, KpiCellStatus> = {};
    for (const kpiId of request.selectedKpis) statusByKpi[kpiId] = statusForKpi(node, kpiId);

    cells.push({
      nodeKey: node.nodeKey,
      rowPath: node.rowPath,
      columnPath: node.columnPath,
      nodeType: node.nodeType,
      values,
      statusByKpi,
      explainability: buildExplainability(node, request, metadata)
    });
  }

  return { rowHeaders, columnHeaders, cells };
}

export function executeView(request: ViewRequest, payload: BackendPayload, metadata: MetadataBundle): ExecutionResultContract {
  const runtimePlan = buildRuntimePlan(request, metadata);
  const aggregation = aggregateRequest(request, payload, metadata);
  const aggregateLookup = buildAggregateLookup(aggregation.nodes);

  const evaluated = new Map<string, any>();
  for (const [key, node] of aggregation.nodes.entries()) {
    evaluated.set(key, evaluateKpisForNode(node, runtimePlan, metadata, aggregateLookup));
  }

  return {
    matrix: assembleRendererMatrix(evaluated, request, metadata),
    executionMeta: {
      planVersion: runtimePlan.planVersion,
      sliceSignature: payload.sliceSignature
    }
  };
}
