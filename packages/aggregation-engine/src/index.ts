import type { BackendPayload, FilterSpec, ViewRequest } from "@engine/contracts";
import { createEmptyNode, createNodeKey, type AggregateBag, type MetadataBundle, type NodeContext } from "@engine/engine-model";

export function applyFilters(records: BackendPayload["records"], filters: FilterSpec[]): BackendPayload["records"] {
  if (filters.length === 0) return records;
  return records.filter(record =>
    filters.every(filter => filter.allowedMembers.includes(String(record[filter.dimensionId])))
  );
}

function buildContext(record: Record<string, unknown>, dims: string[]): NodeContext {
  const byDimension: Record<string, string> = {};
  for (const dim of dims) byDimension[dim] = String(record[dim]);
  return { byDimension };
}

function accumulate(target: AggregateBag, record: Record<string, unknown>, measureIds: string[]) {
  for (const measureId of measureIds) {
    const raw = record[measureId];
    const num = typeof raw === "number" ? raw : Number(raw ?? 0);
    target[measureId] = (target[measureId] ?? 0) + num;
  }
}

function subtotalSpecs(values: string[], dims: string[], enabled: string[]) {
  const out: { path: string[]; includedDims: string[]; subtotalMember: string }[] = [];
  for (let i = 0; i < dims.length; i++) {
    if (enabled.includes(dims[i])) {
      out.push({
        path: values.slice(0, i + 1).concat(["__TOTAL__"]),
        includedDims: dims.slice(0, i + 1),
        subtotalMember: values[i]
      });
    }
  }
  return out;
}

export function aggregateRequest(request: ViewRequest, payload: BackendPayload, metadata: MetadataBundle) {
  const records = applyFilters(payload.records, request.filters);
  const nodes = new Map<string, any>();
  const measureIds = Object.keys(metadata.measures);
  const allDims = [...request.rowDimensions, ...request.columnDimensions];

  for (const record of records) {
    const rowPath = request.rowDimensions.map(d => String(record[d]));
    const columnPath = request.columnDimensions.map(d => String(record[d]));
    const leafContext = buildContext(record, allDims);
    const leafKey = createNodeKey(rowPath, columnPath);
    if (!nodes.has(leafKey)) nodes.set(leafKey, createEmptyNode(rowPath, columnPath, leafContext, "leaf"));
    const leaf = nodes.get(leafKey)!;
    accumulate(leaf.baseAggregates, record, measureIds);
    leaf.contributingRecords.push(record);

    if (request.totalOptions.showRowTotals) {
      for (const spec of subtotalSpecs(rowPath, request.rowDimensions, request.totalOptions.rowSubtotalDimensions)) {
        const ctx = buildContext(record, [...spec.includedDims, ...request.columnDimensions]);
        const lastDim = spec.includedDims[spec.includedDims.length - 1];
        ctx.byDimension[lastDim] = spec.subtotalMember;
        const key = createNodeKey(spec.path, columnPath);
        if (!nodes.has(key)) nodes.set(key, createEmptyNode(spec.path, columnPath, ctx, "rowSubtotal"));
        const n = nodes.get(key)!;
        accumulate(n.baseAggregates, record, measureIds);
        n.contributingRecords.push(record);
      }
    }

    if (request.totalOptions.showColumnTotals) {
      for (const spec of subtotalSpecs(columnPath, request.columnDimensions, request.totalOptions.columnSubtotalDimensions)) {
        const ctx = buildContext(record, [...request.rowDimensions, ...spec.includedDims]);
        const lastDim = spec.includedDims[spec.includedDims.length - 1];
        ctx.byDimension[lastDim] = spec.subtotalMember;
        const key = createNodeKey(rowPath, spec.path);
        if (!nodes.has(key)) nodes.set(key, createEmptyNode(rowPath, spec.path, ctx, "columnSubtotal"));
        const n = nodes.get(key)!;
        accumulate(n.baseAggregates, record, measureIds);
        n.contributingRecords.push(record);
      }
    }

    if (request.totalOptions.showGrandTotal) {
      const grandKey = createNodeKey(["__GRAND_TOTAL__"], ["__GRAND_TOTAL__"]);
      if (!nodes.has(grandKey)) nodes.set(grandKey, createEmptyNode(["__GRAND_TOTAL__"], ["__GRAND_TOTAL__"], { byDimension: {} }, "grandTotal"));
      const grand = nodes.get(grandKey)!;
      accumulate(grand.baseAggregates, record, measureIds);
      grand.contributingRecords.push(record);
    }
  }

  return { nodes };
}
