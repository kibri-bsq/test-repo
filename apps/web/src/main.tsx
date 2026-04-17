import React, { useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { executeView } from "@engine/execution-engine";
import { examples } from "@engine/test-data";

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

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(4);
  return String(v);
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

function App() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [customPayload, setCustomPayload] = useState<any | null>(null);
  const [customMetadata, setCustomMetadata] = useState<any | null>(null);
  const [customRequest, setCustomRequest] = useState<any | null>(null);
  const [useCustom, setUseCustom] = useState(false);
  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(null);
  const [traceFilterKpi, setTraceFilterKpi] = useState<string>("ALL");
  const [metricMode, setMetricMode] = useState<string>("ALL");
  const [cellDensity, setCellDensity] = useState<"compact" | "expanded">("expanded");
  const [sortRows, setSortRows] = useState<"natural" | "asc" | "desc">("natural");
  const [sortCols, setSortCols] = useState<"natural" | "asc" | "desc">("natural");
  const [hideEmptyRows, setHideEmptyRows] = useState(false);
  const [hideEmptyCols, setHideEmptyCols] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const builtIn = examples[selectedIndex];
  const activeInput = useMemo(() => {
    if (useCustom && customPayload && customMetadata && customRequest) {
      return { payload: customPayload, metadata: customMetadata, request: customRequest };
    }
    return builtIn;
  }, [useCustom, customPayload, customMetadata, customRequest, builtIn]);

  const validationErrors = validateInput(activeInput);
  const result = useMemo(() => {
    if (validationErrors.length > 0) return null;
    try {
      return executeView(activeInput.request, activeInput.payload, activeInput.metadata);
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

  const metricOptions = useMemo(() => {
    if (!result || "__error" in result || result.matrix.cells.length === 0) return ["ALL"];
    return ["ALL", ...Object.keys(result.matrix.cells[0].values)];
  }, [result]);

  const matrixModel = useMemo(() => {
    if (!result || "__error" in result) return null;

    const cellMap = new Map<string, any>();
    for (const cell of result.matrix.cells as any[]) {
      cellMap.set(`${cell.rowPath.join(" / ")}||${cell.columnPath.join(" / ")}`, cell);
    }

    let rowKeys = Array.from(new Set(result.matrix.cells.map((c: any) => c.rowPath.join(" / "))));
    let colKeys = Array.from(new Set(result.matrix.cells.map((c: any) => c.columnPath.join(" / "))));

    const grandRow = rowKeys.find((r: string) => r.includes("__GRAND_TOTAL__"));
    const grandCol = colKeys.find((c: string) => c.includes("__GRAND_TOTAL__"));

    const normalRows = rowKeys.filter((r: string) => r !== grandRow);
    const normalCols = colKeys.filter((c: string) => c !== grandCol);

    const sorter = (dir: "asc" | "desc") => (a: string, b: string) => dir === "asc" ? a.localeCompare(b) : b.localeCompare(a);
    if (sortRows !== "natural") normalRows.sort(sorter(sortRows));
    if (sortCols !== "natural") normalCols.sort(sorter(sortCols));

    rowKeys = grandRow ? [...normalRows, grandRow] : normalRows;
    colKeys = grandCol ? [...normalCols, grandCol] : normalCols;

    const rowGroups = new Map<string, string[]>();
    for (const row of rowKeys) {
      const group = row.split(" / ")[0] ?? row;
      if (!rowGroups.has(group)) rowGroups.set(group, []);
      rowGroups.get(group)!.push(row);
    }

    let visibleRows: string[] = [];
    for (const [group, rows] of rowGroups.entries()) {
      visibleRows.push(group);
      if (!collapsedGroups[group]) {
        visibleRows.push(...rows.filter(r => r !== group));
      }
    }

    if (hideEmptyRows) {
      visibleRows = visibleRows.filter((rowKey: string) => {
        if (rowGroups.has(rowKey)) return true;
        return colKeys.some((colKey: string) => {
          const cell = cellMap.get(`${rowKey}||${colKey}`);
          if (!cell) return false;
          const values = metricMode === "ALL" ? Object.values(cell.values) : [cell.values[metricMode]];
          return values.some(isMeaningfulValue);
        });
      });
    }

    let visibleCols = [...colKeys];
    if (hideEmptyCols) {
      visibleCols = visibleCols.filter((colKey: string) => {
        if (colKey === grandCol) return true;
        return rowKeys.some((rowKey: string) => {
          const cell = cellMap.get(`${rowKey}||${colKey}`);
          if (!cell) return false;
          const values = metricMode === "ALL" ? Object.values(cell.values) : [cell.values[metricMode]];
          return values.some(isMeaningfulValue);
        });
      });
    }

    return { rowKeys, colKeys: visibleCols, visibleRows, rowGroups, cellMap, grandRow, grandCol };
  }, [result, sortRows, sortCols, hideEmptyRows, hideEmptyCols, collapsedGroups, metricMode]);

  async function handleUpload(kind: "payload" | "metadata" | "request", file?: File) {
    if (!file) return;
    try {
      const parsed = await readJsonFile(file);
      if (kind === "payload") setCustomPayload(parsed);
      if (kind === "metadata") setCustomMetadata(parsed);
      if (kind === "request") setCustomRequest(parsed);
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
    const errs = validateInput({ payload: customPayload, metadata: customMetadata, request: customRequest });
    if (errs.length > 0) {
      setError(errs.join("\n"));
      setMessage("");
      return;
    }
    setUseCustom(true);
    setSelectedNodeKey(null);
    setTraceFilterKpi("ALL");
    setMessage("Running custom example.");
    setError("");
  }

  function loadBuiltIn(index: number) {
    setSelectedIndex(index);
    setUseCustom(false);
    setSelectedNodeKey(null);
    setTraceFilterKpi("ALL");
    setMessage(`Loaded built-in example: ${examples[index].name}`);
    setError("");
  }

  function toggleGroup(group: string) {
    setCollapsedGroups(prev => ({ ...prev, [group]: !prev[group] }));
  }

  const isExecutionError = result && "__error" in result;

  return (
    <div>
      <style>{`
        body { margin: 0; font-family: Arial, sans-serif; background: #f6f8fb; color: #1f2937; }
        #root { padding: 20px; }
        .layout { display: grid; grid-template-columns: 320px 1fr 430px; gap: 20px; }
        .panel { background: #fff; border: 1px solid #dbe3ef; border-radius: 12px; padding: 16px; min-height: 240px; }
        .title { font-size: 26px; font-weight: 700; margin-bottom: 6px; }
        .subtitle { color: #52637a; margin-bottom: 18px; }
        label { display: block; font-weight: 600; margin-bottom: 6px; }
        select, button, input[type=file] { width: 100%; box-sizing: border-box; margin-bottom: 12px; padding: 10px; border: 1px solid #c9d3e2; border-radius: 8px; background: #fff; }
        button { cursor: pointer; background: #1d4ed8; color: white; border: none; }
        button.secondary { background: #eef3fb; color: #1f2937; border: 1px solid #d6ddea; }
        .button-grid { display: grid; gap: 8px; }
        .toolbarGrid, .toolbarGrid3 { display: grid; gap: 10px; margin-bottom: 12px; }
        .toolbarGrid { grid-template-columns: 1fr 1fr; }
        .toolbarGrid3 { grid-template-columns: 1fr 1fr 1fr; }
        .toggleCard { background: #f8fafc; border: 1px solid #e5ebf3; border-radius: 8px; padding: 10px; font-size: 13px; }
        .error { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; padding: 10px; border-radius: 8px; margin-bottom: 12px; white-space: pre-wrap; }
        .success { background: #effcf3; color: #166534; border: 1px solid #bbf7d0; padding: 10px; border-radius: 8px; margin-bottom: 12px; }
        table { width: 100%; border-collapse: collapse; background: white; }
        th, td { border: 1px solid #dbe3ef; padding: 8px 10px; vertical-align: top; }
        th { background: #eef3fb; text-align: left; position: sticky; top: 0; z-index: 4; }
        .matrix th:first-child, .matrix td:first-child { position: sticky; left: 0; z-index: 3; }
        .matrix th:first-child { background: #eef3fb; }
        .matrix td:first-child { background: #fff; }
        .pinnedGrandCol { position: sticky; right: 0; z-index: 2; background: #eef6ff !important; }
        .grandRow td { position: sticky; bottom: 0; z-index: 2; background: #eef6ff !important; font-weight: 700; }
        .grandRow td:first-child { z-index: 5; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; margin-left: 6px; background: #eef3fb; }
        .status-normal { color: #166534; }
        .status-warning { color: #a16207; }
        .status-suppressed, .status-null { color: #6b7280; }
        .metric { margin-bottom: 6px; }
        .metric-title { font-weight: 600; }
        .small { font-size: 12px; color: #5b6b82; }
        .clickable { cursor: pointer; }
        .clickable:hover { background: #f8fbff; }
        .sectionTitle { font-weight: 700; margin-top: 12px; margin-bottom: 6px; }
        .code { font-family: Consolas, monospace; background: #f6f8fb; padding: 8px; border-radius: 8px; margin-bottom: 8px; white-space: pre-wrap; word-break: break-word; max-height: 180px; overflow: auto; }
        .emptyState { color: #6b7280; font-size: 14px; }
        .matrixWrap { overflow: auto; max-height: 75vh; border: 1px solid #e5ebf3; border-radius: 8px; }
        .cellBox { min-width: 150px; }
        .compact .metric { margin-bottom: 2px; font-size: 12px; }
        .expanded .metric { margin-bottom: 6px; font-size: 13px; }
        .selectedCell { outline: 3px solid #1d4ed8; outline-offset: -3px; }
        .node-subtotal { background: linear-gradient(90deg, #f8fbff 0%, #ffffff 100%); }
        .node-grand { background: #eef6ff; font-weight: 700; }
        .legendGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
        .legendItem { font-size: 12px; color: #4b5563; background: #f8fafc; border: 1px solid #e5ebf3; border-radius: 8px; padding: 8px; }
        .groupRow td { background: #f9fafb; font-weight: 700; }
        .groupButton { all: unset; cursor: pointer; color: #1d4ed8; font-weight: 700; }
        .indent { padding-left: 18px; }
      `}</style>

      <div className="title">Full Consolidated Audit Runtime v4</div>
      <div className="subtitle">Subtotal bands, collapsible groups, pinned grand totals, sorting, and hiding empty rows/columns.</div>

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

          {message ? <div className="success">{message}</div> : null}
          {error ? <div className="error">{error}</div> : null}
          {validationErrors.length > 0 && !error ? <div className="error">{validationErrors.join("\n")}</div> : null}
          {isExecutionError ? <div className="error">{String((result as any).__error)}</div> : null}
        </div>

        <div className="panel">
          {!matrixModel || isExecutionError ? null : (
            <>
              <div className="small" style={{marginBottom: 12}}>
                <div><strong>Mode:</strong> {useCustom ? "Custom Upload" : `Built-in — ${builtIn.name}`}</div>
                <div><strong>Plan Version:</strong> {result.executionMeta.planVersion}</div>
                <div><strong>Slice Signature:</strong> {result.executionMeta.sliceSignature}</div>
                <div><strong>Visible rows:</strong> {matrixModel.visibleRows.length} &nbsp; <strong>Visible columns:</strong> {matrixModel.colKeys.length}</div>
              </div>

              <div className="legendGrid">
                <div className="legendItem"><strong>Leaf</strong> standard analytical cell</div>
                <div className="legendItem"><strong>Subtotal band</strong> tinted subtotal cell and grouped row band</div>
                <div className="legendItem"><strong>Grand total</strong> pinned right column and pinned bottom row</div>
                <div className="legendItem"><strong>Selected</strong> blue outline around active cell</div>
              </div>

              <div className="toolbarGrid3">
                <div>
                  <label>Metric focus</label>
                  <select value={metricMode} onChange={(e) => setMetricMode(e.target.value)}>
                    {metricOptions.map((m: string) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label>Cell density</label>
                  <select value={cellDensity} onChange={(e) => setCellDensity(e.target.value as "compact" | "expanded")}>
                    <option value="expanded">Expanded</option>
                    <option value="compact">Compact</option>
                  </select>
                </div>
                <div>
                  <label>Row sort</label>
                  <select value={sortRows} onChange={(e) => setSortRows(e.target.value as any)}>
                    <option value="natural">Natural</option>
                    <option value="asc">A → Z</option>
                    <option value="desc">Z → A</option>
                  </select>
                </div>
              </div>

              <div className="toolbarGrid3">
                <div>
                  <label>Column sort</label>
                  <select value={sortCols} onChange={(e) => setSortCols(e.target.value as any)}>
                    <option value="natural">Natural</option>
                    <option value="asc">A → Z</option>
                    <option value="desc">Z → A</option>
                  </select>
                </div>
                <div className="toggleCard">
                  <label style={{marginBottom: 4}}>Hide empty rows</label>
                  <input type="checkbox" checked={hideEmptyRows} onChange={(e) => setHideEmptyRows(e.target.checked)} />
                </div>
                <div className="toggleCard">
                  <label style={{marginBottom: 4}}>Hide empty columns</label>
                  <input type="checkbox" checked={hideEmptyCols} onChange={(e) => setHideEmptyCols(e.target.checked)} />
                </div>
              </div>

              <div className="matrixWrap">
                <table className={`matrix ${cellDensity}`}>
                  <thead>
                    <tr>
                      <th>Row \ Column</th>
                      {matrixModel.colKeys.map((col: string) => (
                        <th key={col} className={col === matrixModel.grandCol ? "pinnedGrandCol" : ""}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrixModel.visibleRows.map((row: string) => {
                      const isGroupHeader = matrixModel.rowGroups.has(row);
                      const isGrandRow = row === matrixModel.grandRow;

                      if (isGroupHeader) {
                        const collapsed = !!collapsedGroups[row];
                        return (
                          <tr key={`group-${row}`} className="groupRow">
                            <td colSpan={matrixModel.colKeys.length + 1}>
                              <button className="groupButton" onClick={() => toggleGroup(row)}>
                                {collapsed ? "▶" : "▼"} {row}
                              </button>
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <tr key={row} className={isGrandRow ? "grandRow" : ""}>
                          <td className={isGrandRow ? "pinnedGrandCol" : ""}>
                            <div className="indent"><strong>{row}</strong></div>
                          </td>
                          {matrixModel.colKeys.map((col: string) => {
                            const cell = matrixModel.cellMap.get(`${row}||${col}`);
                            if (!cell) return <td key={`${row}-${col}`} className={col === matrixModel.grandCol ? "pinnedGrandCol" : ""}></td>;

                            const selected = selectedNodeKey === cell.nodeKey;
                            const metricsToShow = metricMode === "ALL"
                              ? Object.entries(cell.values)
                              : Object.entries(cell.values).filter(([metric]) => metric === metricMode);

                            return (
                              <td
                                key={`${row}-${col}`}
                                className={`clickable ${nodeTypeClass(cell.nodeType)} ${selected ? "selectedCell" : ""} ${col === matrixModel.grandCol ? "pinnedGrandCol" : ""}`}
                                onClick={() => setSelectedNodeKey(cell.nodeKey)}
                              >
                                <div className="cellBox">
                                  {metricsToShow.map(([metric, value]) => {
                                    const status = cell.statusByKpi[metric];
                                    return (
                                      <div className="metric" key={metric}>
                                        <span className="metric-title">{metric}:</span>{" "}
                                        <span>{formatValue(value)}</span>
                                        {status ? <span className={`badge status-${status.displayState}`}>{status.displayState}</span> : null}
                                      </div>
                                    );
                                  })}
                                  <div className="small">{cell.nodeType}</div>
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
            </>
          )}
        </div>

        <div className="panel">
          <div className="sectionTitle">Audit Panel</div>
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

              <div className="sectionTitle">Formulas by KPI</div>
              <div className="code">{JSON.stringify(selectedCell.explainability.formulasByKpi, null, 2)}</div>

              <div className="sectionTitle">Values</div>
              <div className="code">{JSON.stringify(selectedCell.explainability.values, null, 2)}</div>

              <div className="sectionTitle">Warnings</div>
              <div className="code">{JSON.stringify(selectedCell.explainability.warnings, null, 2)}</div>

              <div className="sectionTitle">Missing References</div>
              <div className="code">{JSON.stringify(selectedCell.explainability.missingReferences, null, 2)}</div>

              <div className="sectionTitle">Drill-through Records</div>
              <div className="code">{JSON.stringify(selectedCell.explainability.contributingRecords, null, 2)}</div>

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
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
