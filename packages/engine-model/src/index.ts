import type { ContextKey, DimensionId, KpiId, MeasureId, MemberId, NodeKey } from "@engine/contracts";

export interface DimensionMetadata {
  id: DimensionId;
  label: string;
  type: "flat" | "hierarchical" | "ordered" | "hierarchical_ordered";
  ordered: boolean;
  hierarchy: boolean;
  members?: MemberId[];
  ordering?: MemberId[];
  parentByMember?: Record<MemberId, MemberId | null>;
}

export interface MeasureMetadata {
  id: MeasureId;
  label: string;
  aggregation: "sum" | "count" | "avg" | "min" | "max" | "custom";
  formatHint?: string;
}

export interface KpiMetadata {
  id: KpiId;
  label: string;
  formula: string;
  formulaType: "measure_based" | "cross_member" | "context_relative" | "time_relative" | "composite";
  dependencies: string[];
  requiredDimensions: DimensionId[];
  totalStrategy: "aggregate" | "recompute" | "suppress" | "custom";
  validAtLeaf: boolean;
  validAtSubtotal: boolean;
  validAtGrandTotal: boolean;
  missingValueBehavior: "null" | "zero" | "suppress" | "warning";
  formatHint?: string;
  version: string;
}

export interface MetadataBundle {
  schemaVersion: string;
  dimensions: Record<DimensionId, DimensionMetadata>;
  measures: Record<MeasureId, MeasureMetadata>;
  kpis: Record<KpiId, KpiMetadata>;
  formatHints?: Record<string, string>;
}

export interface NodeContext {
  byDimension: Record<DimensionId, MemberId>;
}

export interface AggregateBag {
  [measureId: string]: number | null;
}

export interface KpiBag {
  [kpiId: string]: number | null;
}

export interface MissingReferenceRecord {
  kpiId: string;
  referenceName: string;
  contextKey?: string;
}

export interface TraceRecord {
  step: string;
  detail: string;
  contextKey?: string;
  referenceName?: string;
  kpiId?: string;
}

export interface ComputedNode {
  nodeKey: NodeKey;
  rowPath: string[];
  columnPath: string[];
  context: NodeContext;
  baseAggregates: AggregateBag;
  kpis: KpiBag;
  nodeType: "leaf" | "rowSubtotal" | "columnSubtotal" | "grandTotal";
  suppressedKpis: string[];
  warnings: string[];
  missingReferences: MissingReferenceRecord[];
  contributingRecords: Record<string, string | number | boolean | null>[];
  trace: TraceRecord[];
}

export interface DependencyGraph {
  nodes: string[];
  edges: Record<string, string[]>;
}

export interface RuntimePlan {
  planVersion: string;
  kpiIds: KpiId[];
  astByKpi: Record<KpiId, unknown>;
  dependencyGraph: DependencyGraph;
  evaluationOrder: KpiId[];
  validationSummary: {
    valid: boolean;
    errors: string[];
  };
}

export interface AggregateLookupStore {
  get(context: NodeContext): AggregateBag | undefined;
  set(context: NodeContext, bag: AggregateBag): void;
  has(context: NodeContext): boolean;
  allKeys(): string[];
}

export function createContextKey(context: NodeContext): ContextKey {
  return Object.entries(context.byDimension)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join("|");
}

export function createNodeKey(rowPath: string[], columnPath: string[]): NodeKey {
  return `${rowPath.join("|")}::${columnPath.join("|")}`;
}

export function createEmptyNode(
  rowPath: string[],
  columnPath: string[],
  context: NodeContext,
  nodeType: "leaf" | "rowSubtotal" | "columnSubtotal" | "grandTotal"
): ComputedNode {
  return {
    nodeKey: createNodeKey(rowPath, columnPath),
    rowPath,
    columnPath,
    context,
    baseAggregates: {},
    kpis: {},
    nodeType,
    suppressedKpis: [],
    warnings: [],
    missingReferences: [],
    contributingRecords: [],
    trace: []
  };
}
