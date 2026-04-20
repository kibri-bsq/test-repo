export type DimensionId = string;
export type MemberId = string;
export type MeasureId = string;
export type KpiId = string;
export type NodeKey = string;
export type ContextKey = string;

export interface BackendPayload {
  datasetId: string;
  datasetVersion: string;
  sliceSignature: string;
  extractedAt: string;
  records: Record<string, string | number | boolean | null>[];
  fieldMap: Record<string, string>;
}

export interface FilterSpec {
  dimensionId: DimensionId;
  allowedMembers: MemberId[];
}

export interface TotalOptions {
  showRowTotals: boolean;
  showColumnTotals: boolean;
  showGrandTotal: boolean;
  rowSubtotalDimensions: DimensionId[];
  columnSubtotalDimensions: DimensionId[];
}

export interface DisplayOptions {
  includeDiagnostics: boolean;
}

export interface AxisOrderingRule {
  dimensionId: DimensionId;
  sequence: string[];
}

export interface AxisOrderingConfig {
  row?: Record<string, string[]>;
  column?: Record<string, string[]>;
}

export interface ViewRequest {
  rowDimensions: DimensionId[];
  columnDimensions: DimensionId[];
  selectedKpis: KpiId[];
  filters: FilterSpec[];
  totalOptions: TotalOptions;
  displayOptions: DisplayOptions;
  axisOrdering?: AxisOrderingConfig;
}

export type DisplayState = "normal" | "suppressed" | "null" | "warning" | "error";

export interface StatusReason {
  code: string;
  message: string;
}

export interface KpiCellStatus {
  displayState: DisplayState;
  reasons: StatusReason[];
}

export interface TraceEntry {
  step: string;
  detail: string;
  contextKey?: string;
  referenceName?: string;
  kpiId?: string;
}

export interface ExplainabilityContract {
  nodeKey: NodeKey;
  rowPath: string[];
  columnPath: string[];
  nodeType: "leaf" | "rowSubtotal" | "columnSubtotal" | "grandTotal";
  context: Record<string, string>;
  formulasByKpi: Record<string, string>;
  statusByKpi: Record<string, KpiCellStatus>;
  warnings: string[];
  missingReferences: {
    kpiId: string;
    referenceName: string;
    contextKey?: string;
  }[];
  values: Record<string, number | null>;
  contributingRecords: Record<string, string | number | boolean | null>[];
  executionTrace: TraceEntry[];
}

export interface RendererCell {
  nodeKey: NodeKey;
  rowPath: string[];
  columnPath: string[];
  nodeType: "leaf" | "rowSubtotal" | "columnSubtotal" | "grandTotal";
  values: Record<string, number | null>;
  statusByKpi: Record<string, KpiCellStatus>;
  explainability: ExplainabilityContract;
}

export interface RendererMatrix {
  rowHeaders: string[][];
  columnHeaders: string[][];
  cells: RendererCell[];
}

export interface ExecutionMeta {
  planVersion: string;
  sliceSignature: string;
}

export interface ExecutionResultContract {
  matrix: RendererMatrix;
  executionMeta: ExecutionMeta;
}
