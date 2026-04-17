import React, { useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { executeView } from "@engine/execution-engine";
import { examples } from "@engine/test-data";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(4);
  return String(v);
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function readJsonFile(file: File): Promise<any> {
  return JSON.parse(await file.text());
}

function validateInput(input: any): string[] {
  const errors: string[] = [];
  if (!input.payload?.records || !Array.isArray(input.payload.records)) errors.push("Payload.records must be an array.");
  if (!input.metadata?.measures) errors.push("Metadata.measures is required.");
  if (!input.metadata?.kpis) errors.push("Metadata.kpis is required.");
  if (!Array.isArray(input.request?.rowDimensions)) errors.push("Request.rowDimensions must be an array.");
  if (!Array.isArray(input.request?.columnDimensions)) errors.push("Request.columnDimensions must be an array.");
  if (!Array.isArray(input.request?.selectedKpis)) errors.push("Request.selectedKpis must be an array.");
  for (const kpiId of input.request?.selectedKpis ?? []) {
    if (!input.metadata?.kpis?.[kpiId]) errors.push(`Selected KPI "${kpiId}" is missing in metadata.kpis.`);
  }
  return errors;
}

function nodeTypeClass(nodeType: string): string {
  if (nodeType === "grandTotal") return "node-grand";
  if (nodeType === "rowSubtotal" || nodeType === "columnSubtotal") return "node-subtotal";
  return "node-leaf";
}

function isMeaningfulValue(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "number") return v !== 0;
  return String(v).trim() !== "";
}

function mapToggleOptionToTotals(option: "none" | "row" | "column" | "both", rowDims: string[], colDims: string[]) {
  return {
    showRowTotals: option === "row" || option === "both",
    showColumnTotals: option === "column" || option === "both",
    rowSubtotalDimensions: option === "row" || option === "both" ? [...rowDims] : [],
    columnSubtotalDimensions: option === "column" || option === "both" ? [...colDims] : []
  };
}

function formatPathPart(part: string, kind: "row" | "column", dimLabel: string): string {
  if (part === "__GRAND_TOTAL__") return "Grand Total";
  if (part === "__TOTAL__") return `${dimLabel} Total`;
  return part;
}

function buildMatrix(cells: any[], request: any, placementPlans: Record<string, any>, metricLayoutMode: string, metricMode: string, metricOptions: string[]) {
  const rowDims: string[] = request.rowDimensions ?? [];
  const colDims: string[] = request.columnDimensions ?? [];

  const baseCellMap = new Map(cells.map((c: any) => [`${c.rowPath.join("¦")}||${c.columnPath.join("¦")}`, c]));

  const rowKeys = Array.from(new Set(cells.map((c: any) => c.rowPath.join("¦"))));
  const colKeys = Array.from(new Set(cells.map((c: any) => c.columnPath.join("¦"))));

  const derivedKpis = Object.entries(placementPlans ?? {}).filter(([, plan]: any) => plan.displayInjection?.type === "derived_column");
  const derivedCells: any[] = [];
  const derivedColKeys: string[] = [];

  for (const rowKey of rowKeys) {
    const rowCells = cells.filter((c: any) => c.rowPath.join("¦") === rowKey);
    for (const [kpiId, plan] of derivedKpis as any[]) {
      const colDimsUsed: string[] = plan.colDimsUsed ?? [];
      const groupMap = new Map<string, any[]>();

      for (const cell of rowCells) {
        const baseGroup = cell.columnPath.slice(0, colDimsUsed.length).join("¦") || "__GLOBAL__";
        if (!groupMap.has(baseGroup)) groupMap.set(baseGroup, []);
        groupMap.get(baseGroup)!.push(cell);
      }

      for (const [baseGroup, groupCells] of groupMap.entries()) {
        const representative = groupCells.find((g: any) => g.values && Object.prototype.hasOwnProperty.call(g.values, kpiId));
        if (!representative) continue;
        const derivedPath = baseGroup === "__GLOBAL__" ? [kpiId] : [...baseGroup.split("¦"), kpiId];
        const derivedColKey = derivedPath.join("¦");
        derivedColKeys.push(derivedColKey);
        derivedCells.push({
          nodeKey: `${representative.nodeKey}::DERIVED::${kpiId}`,
          rowPath: representative.rowPath,
          columnPath: derivedPath,
          nodeType: representative.nodeType,
          values: { [kpiId]: representative.values[kpiId] ?? null },
          statusByKpi: { [kpiId]: representative.statusByKpi[kpiId] ?? { displayState: "null", reasons: [] } },
          explainability: representative.explainability
        });
      }
    }
  }

  const mergedCellMap = new Map(baseCellMap);
  for (const dc of derivedCells) {
    mergedCellMap.set(`${dc.rowPath.join("¦")}||${dc.columnPath.join("¦")}`, dc);
  }

  const allColKeys = Array.from(new Set([...colKeys, ...derivedColKeys]));

  const grandRowKey = rowKeys.find((r: string) => r.includes("__GRAND_TOTAL__"));
  const grandColKey = allColKeys.find((c: string) => c.includes("__GRAND_TOTAL__"));

  const normalRowKeys = rowKeys.filter((r: string) => r !== grandRowKey);
  const subtotalRowKeys = normalRowKeys.filter((r: string) => r.includes("__TOTAL__"));
  const leafRowKeys = normalRowKeys.filter((r: string) => !r.includes("__TOTAL__"));

  const rowOrder = [...leafRowKeys, ...subtotalRowKeys, ...(grandRowKey ? [grandRowKey] : [])];
  const colOrder = [
    ...allColKeys.filter((c: string) => c !== grandColKey && !c.includes("__TOTAL__")),
    ...allColKeys.filter((c: string) => c.includes("__TOTAL__")),
    ...(grandColKey ? [grandColKey] : [])
  ];

  const allMetrics = metricOptions.filter((m: string) => m !== "ALL");
  const metricSet = metricMode === "ALL" ? allMetrics : [metricMode];

  const displayColumns =
    metricLayoutMode === "stacked_in_cell"
      ? colOrder.map((colKey: string) => ({ key: colKey, baseColKey: colKey, metric: null }))
      : colOrder.flatMap((colKey: string) =>
          metricSet.map((metric: string) => ({
            key: `${colKey}||${metric}`,
            baseColKey: colKey,
            metric
          }))
        );

  return {
    rowDims,
    colDims,
    rowOrder,
    colOrder,
    displayColumns,
    cellMap: mergedCellMap,
    grandRowKey,
    grandColKey
  };
}

function App() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const builtIn = examples[selectedIndex];

  const [useCustom, setUseCustom] = useState(false);
  const [customPayload, setCustomPayload] = useState<any | null>(null);
  const [customMetadata, setCustomMetadata] = useState<any | null>(null);
  const [customRequest, setCustomRequest] = useState<any | null>(null);

  const [workingPayload, setWorkingPayload] = useState<any>(clone(builtIn.payload));
  const [workingMetadata, setWorkingMetadata] = useState<any>(clone(builtIn.metadata));
  const [workingRequest, setWorkingRequest] = useState<any>(clone(builtIn.request));

  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(null);
  const [traceFilterKpi, setTraceFilterKpi] = useState<string>("ALL");
  const [metricMode, setMetricMode] = useState<string>("ALL");
  const [metricLayoutMode, setMetricLayoutMode] = useState<"stacked_in_cell" | "separate_subcolumns" | "single_metric_focus">("stacked_in_cell");
  const [matrixFullscreen, setMatrixFullscreen] = useState(false);
  const [editorMode, setEditorMode] = useState<"pivot" | "kpis">("pivot");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [grandTotalMode, setGrandTotalMode] = useState<"none" | "row" | "column" | "both">("both");
  const [subTotalMode, setSubTotalMode] = useState<"none" | "row" | "column" | "both">("both");

  const activeInput = useMemo(() => {
    if (useCustom && customPayload && customMetadata && customRequest) {
      return { payload: customPayload, metadata: customMetadata, request: customRequest };
    }
    return { payload: workingPayload, metadata: workingMetadata, request: workingRequest };
  }, [useCustom, customPayload, customMetadata, customRequest, workingPayload, workingMetadata, workingRequest]);

  const validationErrors = useMemo(() => validateInput(activeInput), [activeInput]);

  const result = useMemo(() => {
    if (validationErrors.length > 0) return null;
    try {
      return executeView(activeInput.request, activeInput.payload, activeInput.metadata) as any;
    } catch (e) {
      return { __error: e instanceof Error ? e.message : String(e) } as any;
    }
  }, [activeInput, validationErrors]);

  const selectedCell = useMemo(() => {
    if (!result || "__error" in result || !selectedNodeKey) return null;
    return result.matrix.cells.find((c: any) => c.nodeKey === selectedNodeKey) ?? null;
  }, [result, selectedNodeKey]);

  const filteredTrace = useMemo(() => {
    if (!selectedCell) return [];
    if (traceFilterKpi === "ALL") return selectedCell.explainability.executionTrace;
    return selectedCell.explainability.executionTrace.filter((t: any) => t.kpiId === traceFilterKpi || !t.kpiId);
  }, [selectedCell, traceFilterKpi]);

  const allDimensions = useMemo(() => Object.keys(activeInput.metadata?.dimensions ?? {}), [activeInput]);
  const allKpis = useMemo(() => Object.keys(activeInput.metadata?.kpis ?? {}), [activeInput]);

  const metricOptions = useMemo(() => {
    if (!result || "__error" in result || result.matrix.cells.length === 0) return ["ALL"];
    return ["ALL", ...Array.from(new Set(result.matrix.cells.flatMap((c: any) => Object.keys(c.values))))];
  }, [result]);

  const matrixModel = useMemo(() => {
    if (!result || "__error" in result) return null;
    return buildMatrix(result.matrix.cells, activeInput.request, (result.executionMeta as any).placementPlans ?? {}, metricLayoutMode, metricMode, metricOptions);
  }, [result, activeInput.request, metricLayoutMode, metricMode, metricOptions]);

  function syncTotalModes(nextRequest: any) {
    const rowSubtotalOn = nextRequest.totalOptions.rowSubtotalDimensions.length > 0;
    const colSubtotalOn = nextRequest.totalOptions.columnSubtotalDimensions.length > 0;
    const rowGrandOn = !!nextRequest.totalOptions.showRowTotals;
    const colGrandOn = !!nextRequest.totalOptions.showColumnTotals;
    setSubTotalMode(rowSubtotalOn && colSubtotalOn ? "both" : rowSubtotalOn ? "row" : colSubtotalOn ? "column" : "none");
    setGrandTotalMode(rowGrandOn && colGrandOn ? "both" : rowGrandOn ? "row" : colGrandOn ? "column" : "none");
  }

  function loadBuiltIn(index: number) {
    const ex = examples[index];
    setSelectedIndex(index);
    setUseCustom(false);
    setWorkingPayload(clone(ex.payload));
    setWorkingMetadata(clone(ex.metadata));
    setWorkingRequest(clone(ex.request));
    syncTotalModes(clone(ex.request));
    setSelectedNodeKey(null);
    setTraceFilterKpi("ALL");
    setMessage(`Loaded built-in example: ${examples[index].name}`);
    setError("");
  }

  async function handleUpload(kind: "payload" | "metadata" | "request", file?: File) {
    if (!file) return;
    try {
      const parsed = await readJsonFile(file);
      if (kind === "payload") setCustomPayload(parsed);
      if (kind === "metadata") setCustomMetadata(parsed);
      if (kind === "request") {
        setCustomRequest(parsed);
        syncTotalModes(parsed);
      }
      setMessage(`${kind} uploaded successfully.`);
      setError("");
    } catch (e) {
      setError(`Failed to parse ${kind}: ${e instanceof Error ? e.message : String(e)}`);
      setMessage("");
    }
  }

  function runCustom() {
    if (!customPayload || !customMetadata || !customRequest) {
      setError("Upload payload, metadata, and request JSON before running a custom example.");
      return;
    }
    setUseCustom(true);
    setSelectedNodeKey(null);
    setTraceFilterKpi("ALL");
    setMessage("Running custom example.");
    setError("");
  }

  function updateRequest(mutator: (draft: any) => void) {
    setWorkingRequest((prev: any) => {
      const next = clone(prev);
      mutator(next);
      syncTotalModes(next);
      return next;
    });
  }

  function moveDimensionToRow(dim: string) {
    updateRequest((next) => {
      next.columnDimensions = next.columnDimensions.filter((d: string) => d !== dim);
      if (!next.rowDimensions.includes(dim)) next.rowDimensions.push(dim);
      next.totalOptions.rowSubtotalDimensions = next.totalOptions.rowSubtotalDimensions.filter((d: string) => next.rowDimensions.includes(d));
      next.totalOptions.columnSubtotalDimensions = next.totalOptions.columnSubtotalDimensions.filter((d: string) => next.columnDimensions.includes(d));
    });
  }

  function moveDimensionToColumn(dim: string) {
    updateRequest((next) => {
      next.rowDimensions = next.rowDimensions.filter((d: string) => d !== dim);
      if (!next.columnDimensions.includes(dim)) next.columnDimensions.push(dim);
      next.totalOptions.rowSubtotalDimensions = next.totalOptions.rowSubtotalDimensions.filter((d: string) => next.rowDimensions.includes(d));
      next.totalOptions.columnSubtotalDimensions = next.totalOptions.columnSubtotalDimensions.filter((d: string) => next.columnDimensions.includes(d));
    });
  }

  function removeFromAxes(dim: string) {
    updateRequest((next) => {
      next.rowDimensions = next.rowDimensions.filter((d: string) => d !== dim);
      next.columnDimensions = next.columnDimensions.filter((d: string) => d !== dim);
      next.totalOptions.rowSubtotalDimensions = next.totalOptions.rowSubtotalDimensions.filter((d: string) => d !== dim);
      next.totalOptions.columnSubtotalDimensions = next.totalOptions.columnSubtotalDimensions.filter((d: string) => d !== dim);
    });
  }

  function toggleKpiSelection(kpiId: string) {
    updateRequest((next) => {
      if (next.selectedKpis.includes(kpiId)) next.selectedKpis = next.selectedKpis.filter((k: string) => k !== kpiId);
      else next.selectedKpis.push(kpiId);
    });
  }

  function updateKpiField(kpiId: string, field: string, value: any) {
    setWorkingMetadata((prev: any) => {
      const next = clone(prev);
      next.kpis[kpiId][field] = value;
      return next;
    });
  }

  function addBlankKpi() {
    const newId = `KPI_${Object.keys(workingMetadata.kpis).length + 1}`;
    setWorkingMetadata((prev: any) => {
      const next = clone(prev);
      next.kpis[newId] = {
        id: newId,
        label: newId,
        formula: "Revenue",
        formulaType: "measure_based",
        dependencies: [],
        requiredDimensions: [],
        totalStrategy: "recompute",
        validAtLeaf: true,
        validAtSubtotal: true,
        validAtGrandTotal: true,
        missingValueBehavior: "warning",
        version: "1"
      };
      return next;
    });
  }

  function applyGrandTotalMode(mode: "none" | "row" | "column" | "both") {
    setGrandTotalMode(mode);
    updateRequest((next) => {
      next.totalOptions.showRowTotals = mode === "row" || mode === "both";
      next.totalOptions.showColumnTotals = mode === "column" || mode === "both";
      next.totalOptions.showGrandTotal = mode !== "none";
    });
  }

  function applySubTotalMode(mode: "none" | "row" | "column" | "both") {
    setSubTotalMode(mode);
    updateRequest((next) => {
      next.totalOptions.rowSubtotalDimensions = mode === "row" || mode === "both" ? [...next.rowDimensions] : [];
      next.totalOptions.columnSubtotalDimensions = mode === "column" || mode === "both" ? [...next.columnDimensions] : [];
    });
  }

  const isExecutionError = result && "__error" in result;

  const matrixTable = matrixModel ? (
    <div className="matrixWrap" style={matrixFullscreen ? { maxHeight: "none", height: "100%" } : {}}>
      <table className="matrix">
        <thead>
          <tr>
            {matrixModel.rowDims.map((dim: string) => <th key={dim}>{dim}</th>)}
            {matrixModel.displayColumns.map((dc: any) => {
              const pathParts = dc.baseColKey.split("¦");
              const labelBase = pathParts.map((part: string, idx: number) => formatPathPart(part, "column", matrixModel.colDims[Math.min(idx, matrixModel.colDims.length - 1)] ?? "Column")).join(" / ");
              const label = dc.metric ? `${labelBase} / ${dc.metric}` : labelBase;
              return <th key={dc.key}>{label}</th>;
            })}
          </tr>
        </thead>
        <tbody>
          {matrixModel.rowOrder.map((rowKey: string) => {
            const rowParts = rowKey.split("¦");
            const isGrandRow = rowKey === matrixModel.grandRowKey;
            return (
              <tr key={rowKey} className={isGrandRow ? "grandRow" : rowKey.includes("__TOTAL__") ? "subtotalRow" : ""}>
                {matrixModel.rowDims.map((dim: string, idx: number) => {
                  const raw = rowParts[idx] ?? "";
                  const label = formatPathPart(raw, "row", dim);
                  return <td key={`${rowKey}-${dim}`}><strong>{label}</strong></td>;
                })}
                {matrixModel.displayColumns.map((dc: any) => {
                  const cell = matrixModel.cellMap.get(`${rowKey}||${dc.baseColKey}`);
                  if (!cell) return <td key={`${rowKey}-${dc.key}`}></td>;
                  const selected = selectedNodeKey === cell.nodeKey;
                  const entries = dc.metric
                    ? Object.entries(cell.values).filter(([metric]) => metric === dc.metric)
                    : (metricMode === "ALL" ? Object.entries(cell.values) : Object.entries(cell.values).filter(([metric]) => metric === metricMode));
                  return (
                    <td
                      key={`${rowKey}-${dc.key}`}
                      className={`${nodeTypeClass(cell.nodeType)} ${selected ? "selectedCell" : ""}`}
                      onClick={() => setSelectedNodeKey(cell.nodeKey)}
                    >
                      <div className="cellBox">
                        {entries.map(([metric, value]) => {
                          const status = cell.statusByKpi[metric];
                          return (
                            <div className="metric" key={`${dc.key}-${metric}`}>
                              {!dc.metric ? <span className="metric-title">{metric}: </span> : null}
                              <span>{formatValue(value)}</span>
                              {status ? <span className={`badge status-${status.displayState}`}>{status.displayState}</span> : null}
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  ) : null;

  return (
    <div>
      <style>{`
        body { margin: 0; font-family: Arial, sans-serif; background: #f6f8fb; color: #1f2937; }
        #root { padding: 20px; }
        .layout { display: grid; grid-template-columns: 360px 1fr 450px; gap: 20px; }
        .panel { background: #fff; border: 1px solid #dbe3ef; border-radius: 12px; padding: 16px; min-height: 240px; }
        .title { font-size: 26px; font-weight: 700; margin-bottom: 6px; }
        .subtitle { color: #52637a; margin-bottom: 18px; }
        label { display: block; font-weight: 600; margin-bottom: 6px; }
        select, button, input[type=file], textarea, input[type=text] { width: 100%; box-sizing: border-box; margin-bottom: 12px; padding: 10px; border: 1px solid #c9d3e2; border-radius: 8px; background: #fff; font-family: inherit; }
        button { cursor: pointer; background: #1d4ed8; color: white; border: none; }
        button.secondary { background: #eef3fb; color: #1f2937; border: 1px solid #d6ddea; }
        .button-grid { display: grid; gap: 8px; }
        .toolbarGrid, .toolbarGrid3 { display: grid; gap: 10px; margin-bottom: 12px; }
        .toolbarGrid { grid-template-columns: 1fr 1fr; }
        .toolbarGrid3 { grid-template-columns: 1fr 1fr 1fr; }
        .toggleCard, .axisList, .legendItem, .dimRow, .kpiCard { background: #f8fafc; border: 1px solid #e5ebf3; border-radius: 8px; padding: 10px; margin-bottom: 10px; }
        .sectionTitle { font-weight: 700; margin-top: 12px; margin-bottom: 6px; }
        .code { font-family: Consolas, monospace; background: #f6f8fb; padding: 8px; border-radius: 8px; margin-bottom: 8px; white-space: pre-wrap; word-break: break-word; max-height: 180px; overflow: auto; font-size: 12px; }
        .error { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; padding: 10px; border-radius: 8px; margin-bottom: 12px; white-space: pre-wrap; }
        .success { background: #effcf3; color: #166534; border: 1px solid #bbf7d0; padding: 10px; border-radius: 8px; margin-bottom: 12px; }
        .small { font-size: 12px; color: #5b6b82; }
        .pill { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 12px; background: #eef3fb; margin-right: 6px; margin-bottom: 6px; }
        .editorTabs { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
        .dimActions { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
        .dimActions button { padding: 8px; font-size: 12px; }
        .kpiGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        table { width: 100%; border-collapse: collapse; background: white; }
        th, td { border: 1px solid #dbe3ef; padding: 8px 10px; vertical-align: top; }
        th { background: #eef3fb; text-align: left; position: sticky; top: 0; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; margin-left: 6px; background: #eef3fb; }
        .status-normal { color: #166534; }
        .status-warning { color: #a16207; }
        .status-suppressed, .status-null { color: #6b7280; }
        .metric { margin-bottom: 6px; }
        .metric-title { font-weight: 600; }
        .emptyState { color: #6b7280; font-size: 14px; }
        .matrixWrap { overflow: auto; max-height: 75vh; border: 1px solid #e5ebf3; border-radius: 8px; }
        .cellBox { min-width: 130px; }
        .selectedCell { outline: 3px solid #1d4ed8; outline-offset: -3px; }
        .node-subtotal, .subtotalRow td { background: #f8fbff; }
        .node-grand, .grandRow td { background: #eef6ff; font-weight: 700; }
        .legendGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
        .matrixFullscreenOverlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.55); z-index: 50; display: flex; }
        .matrixFullscreenPanel { background: white; margin: 16px; border-radius: 12px; border: 1px solid #dbe3ef; display: flex; flex-direction: column; width: calc(100vw - 32px); height: calc(100vh - 32px); overflow: hidden; }
        .matrixFullscreenHeader { padding: 12px 16px; border-bottom: 1px solid #e5ebf3; display: flex; justify-content: space-between; align-items: center; background: #f8fafc; }
        .matrixFullscreenBody { padding: 16px; overflow: auto; flex: 1; }
      `}</style>

      <div className="title">Axis-Aware KPI Compute Engine Playground</div>
      <div className="subtitle">Fixed matrix viewer with Product × Scenario report, large-volume built-in option, working metric sub-column mode, separate row-dimension columns, cleaner total labels/order, and explicit subtotal/grand-total controls.</div>

      <div className="layout">
        <div className="panel">
          <label>Built-in Example</label>
          <select value={selectedIndex} onChange={(e) => loadBuiltIn(Number(e.target.value))}>
            {examples.map((ex, idx) => <option key={ex.name} value={idx}>{ex.name}</option>)}
          </select>

          <div className="button-grid">
            <button className="secondary" onClick={() => downloadJson("payload.json", activeInput.payload)}>Download Payload JSON</button>
            <button className="secondary" onClick={() => downloadJson("metadata.json", activeInput.metadata)}>Download Metadata JSON</button>
            <button className="secondary" onClick={() => downloadJson("request.json", activeInput.request)}>Download Request JSON</button>
          </div>

          <hr style={{margin: "16px 0", border: 0, borderTop: "1px solid #e5ebf3"}} />

          <label>Upload Custom Payload JSON</label>
          <input type="file" accept=".json,application/json" onChange={(e) => handleUpload("payload", e.target.files?.[0])} />
          <label>Upload Custom Metadata JSON</label>
          <input type="file" accept=".json,application/json" onChange={(e) => handleUpload("metadata", e.target.files?.[0])} />
          <label>Upload Custom Request JSON</label>
          <input type="file" accept=".json,application/json" onChange={(e) => handleUpload("request", e.target.files?.[0])} />
          <button onClick={runCustom}>Run Custom Example</button>

          <div className="editorTabs">
            <button className={editorMode === "pivot" ? "" : "secondary"} onClick={() => setEditorMode("pivot")}>Pivot Editor</button>
            <button className={editorMode === "kpis" ? "" : "secondary"} onClick={() => setEditorMode("kpis")}>KPI Metadata Editor</button>
          </div>

          {editorMode === "pivot" ? (
            <>
              <div className="sectionTitle">Current row dimensions</div>
              <div className="axisList">{workingRequest.rowDimensions.map((d: string) => <span key={d} className="pill">{d}</span>)}</div>
              <div className="sectionTitle">Current column dimensions</div>
              <div className="axisList">{workingRequest.columnDimensions.map((d: string) => <span key={d} className="pill">{d}</span>)}</div>

              <div className="sectionTitle">Grand Total controls</div>
              <select value={grandTotalMode} onChange={(e) => applyGrandTotalMode(e.target.value as any)}>
                <option value="none">None</option>
                <option value="row">Row</option>
                <option value="column">Column</option>
                <option value="both">Both</option>
              </select>

              <div className="sectionTitle">Subtotal controls</div>
              <select value={subTotalMode} onChange={(e) => applySubTotalMode(e.target.value as any)}>
                <option value="none">None</option>
                <option value="row">Row</option>
                <option value="column">Column</option>
                <option value="both">Both</option>
              </select>

              <div className="sectionTitle">Dimension placement controls</div>
              {allDimensions.map((dim: string) => (
                <div className="dimRow" key={dim}>
                  <div><strong>{dim}</strong></div>
                  <div className="small">Current placement: {workingRequest.rowDimensions.includes(dim) ? "Row" : workingRequest.columnDimensions.includes(dim) ? "Column" : "Unused"}</div>
                  <div className="dimActions">
                    <button onClick={() => moveDimensionToRow(dim)}>To Row</button>
                    <button onClick={() => moveDimensionToColumn(dim)}>To Column</button>
                    <button onClick={() => removeFromAxes(dim)}>Unused</button>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <>
              <button onClick={addBlankKpi}>Add blank KPI</button>
              {allKpis.map((kpiId: string) => {
                const k = workingMetadata.kpis[kpiId];
                return (
                  <div key={kpiId} className="kpiCard">
                    <div className="sectionTitle">{kpiId}</div>
                    <label>Label</label>
                    <input value={k.label ?? ""} onChange={(e) => updateKpiField(kpiId, "label", e.target.value)} />
                    <label>Formula</label>
                    <textarea rows={3} value={k.formula ?? ""} onChange={(e) => updateKpiField(kpiId, "formula", e.target.value)} />
                    <div className="kpiGrid">
                      <div>
                        <label>Formula Type</label>
                        <select value={k.formulaType ?? "measure_based"} onChange={(e) => updateKpiField(kpiId, "formulaType", e.target.value)}>
                          <option value="measure_based">measure_based</option>
                          <option value="cross_member">cross_member</option>
                          <option value="context_relative">context_relative</option>
                          <option value="time_relative">time_relative</option>
                          <option value="composite">composite</option>
                        </select>
                      </div>
                      <div>
                        <label>Total Strategy</label>
                        <select value={k.totalStrategy ?? "recompute"} onChange={(e) => updateKpiField(kpiId, "totalStrategy", e.target.value)}>
                          <option value="recompute">recompute</option>
                          <option value="aggregate">aggregate</option>
                          <option value="suppress">suppress</option>
                          <option value="custom">custom</option>
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {message ? <div className="success">{message}</div> : null}
          {error ? <div className="error">{error}</div> : null}
          {validationErrors.length > 0 && !error ? <div className="error">{validationErrors.join("\n")}</div> : null}
          {isExecutionError ? <div className="error">{String((result as any).__error)}</div> : null}
        </div>

        <div className="panel">
          {!matrixModel || isExecutionError ? null : (
            <>
              <div className="small" style={{marginBottom: 12}}>
                <div><strong>Mode:</strong> {useCustom ? "Custom Upload" : examples[selectedIndex].name}</div>
                <div><strong>Plan Version:</strong> {result.executionMeta.planVersion}</div>
                <div><strong>Rows:</strong> {matrixModel.rowOrder.length} &nbsp; <strong>Columns:</strong> {matrixModel.displayColumns.length}</div>
              </div>

              <div className="legendGrid">
                <div className="legendItem"><strong>Separate row dimension columns</strong> each row axis dimension now has its own visible column</div>
                <div className="legendItem"><strong>Metric sub-column mode</strong> each measure/KPI can expand into its own separate matrix column</div>
                <div className="legendItem"><strong>Total labels</strong> subtotal labels use the dimension name, such as Month Total</div>
                <div className="legendItem"><strong>Derived KPI placement</strong> planner-driven derived KPI columns remain supported</div>
              </div>

              <div className="toolbarGrid3">
                <div>
                  <label>Metric focus</label>
                  <select value={metricMode} onChange={(e) => setMetricMode(e.target.value)}>
                    {metricOptions.map((m: string) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label>Metric layout mode</label>
                  <select value={metricLayoutMode} onChange={(e) => setMetricLayoutMode(e.target.value as any)}>
                    <option value="stacked_in_cell">stacked_in_cell</option>
                    <option value="separate_subcolumns">separate_subcolumns</option>
                    <option value="single_metric_focus">single_metric_focus</option>
                  </select>
                </div>
                <div>
                  <label>Matrix view</label>
                  <button className="secondary" onClick={() => setMatrixFullscreen(true)}>Open full screen matrix</button>
                </div>
              </div>

              {matrixTable}
            </>
          )}
        </div>

        <div className="panel">
          <div className="sectionTitle">Audit + Placement Panel</div>
          {result && !("__error" in result) ? (
            <>
              <div className="sectionTitle">Placement plans</div>
              <div className="code">{JSON.stringify((result.executionMeta as any).placementPlans ?? {}, null, 2)}</div>
            </>
          ) : null}

          {!selectedCell ? (
            <div className="emptyState">Click a matrix cell to inspect.</div>
          ) : (
            <>
              <div className="sectionTitle">Identity</div>
              <div className="code">{JSON.stringify({
                nodeKey: selectedCell.explainability.nodeKey,
                rowPath: selectedCell.explainability.rowPath,
                columnPath: selectedCell.explainability.columnPath,
                nodeType: selectedCell.explainability.nodeType
              }, null, 2)}</div>

              <div className="sectionTitle">Context</div>
              <div className="code">{JSON.stringify(selectedCell.explainability.context, null, 2)}</div>

              <div className="sectionTitle">Values</div>
              <div className="code">{JSON.stringify(selectedCell.explainability.values, null, 2)}</div>

              <div className="sectionTitle">Per-KPI Trace Filter</div>
              <select value={traceFilterKpi} onChange={(e) => setTraceFilterKpi(e.target.value)}>
                <option value="ALL">ALL</option>
                {Object.keys(selectedCell.explainability.formulasByKpi).map((kpi: string) => (
                  <option key={kpi} value={kpi}>{kpi}</option>
                ))}
              </select>

              <div className="sectionTitle">Execution Trace</div>
              <div className="code">{JSON.stringify(filteredTrace, null, 2)}</div>
            </>
          )}
        </div>
      </div>

      {matrixFullscreen && matrixModel ? (
        <div className="matrixFullscreenOverlay">
          <div className="matrixFullscreenPanel">
            <div className="matrixFullscreenHeader">
              <div>
                <strong>Full Screen Matrix</strong>
                <div className="small">Large analytical matrix view.</div>
              </div>
              <button onClick={() => setMatrixFullscreen(false)}>Close full screen</button>
            </div>
            <div className="matrixFullscreenBody">
              {matrixTable}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
