import type { AggregateBag, AggregateLookupStore, ComputedNode, KpiMetadata, MetadataBundle, NodeContext, RuntimePlan, DimensionMetadata } from "@engine/engine-model";
import { createContextKey } from "@engine/engine-model";
import type { AstNode, ContextOverride, ContextualReferenceNode } from "@engine/formula-parser";

export class InMemoryAggregateLookupStore implements AggregateLookupStore {
  private readonly store = new Map<string, AggregateBag>();
  get(context: NodeContext): AggregateBag | undefined { return this.store.get(createContextKey(context)); }
  set(context: NodeContext, bag: AggregateBag): void { this.store.set(createContextKey(context), bag); }
  has(context: NodeContext): boolean { return this.store.has(createContextKey(context)); }
  allKeys(): string[] { return [...this.store.keys()]; }
}

function addTrace(node: ComputedNode, step: string, detail: string, kpiId?: string, extra?: {contextKey?: string; referenceName?: string}) {
  node.trace.push({ step, detail, kpiId, ...(extra ?? {}) });
}

function evalFunction(name: string, args: (number | null)[]): number | null {
  switch (name.toUpperCase()) {
    case "ABS":
      return args[0] == null ? null : Math.abs(args[0]);
    default:
      throw new Error(`Unsupported function: ${name}`);
  }
}

function resolveParentMember(dimension: DimensionMetadata, currentMember: string): string | null {
  return dimension.parentByMember?.[currentMember] ?? null;
}

function resolvePreviousMember(dimension: DimensionMetadata, currentMember: string): string | null {
  const ordering = dimension.ordering ?? dimension.members ?? [];
  const idx = ordering.indexOf(currentMember);
  if (idx <= 0) return null;
  return ordering[idx - 1] ?? null;
}

export function resolveContextOverride(currentContext: NodeContext, override: ContextOverride, metadata: MetadataBundle): NodeContext | null {
  const dimension = metadata.dimensions[override.dimensionId];
  if (!dimension) throw new Error(`Unknown dimension in override: ${override.dimensionId}`);

  if (override.value === "current") return currentContext;

  if (override.value === "parent") {
    const currentMember = currentContext.byDimension[override.dimensionId];
    if (!currentMember) return null;
    const parent = resolveParentMember(dimension, currentMember);
    if (!parent) return null;
    return { byDimension: { ...currentContext.byDimension, [override.dimensionId]: parent } };
  }

  if (override.value === "previous") {
    const currentMember = currentContext.byDimension[override.dimensionId];
    if (!currentMember) return null;
    const prev = resolvePreviousMember(dimension, currentMember);
    if (!prev) return null;
    return { byDimension: { ...currentContext.byDimension, [override.dimensionId]: prev } };
  }

  if (override.value === "next") {
    throw new Error("next is not implemented in this scaffold");
  }

  return { byDimension: { ...currentContext.byDimension, [override.dimensionId]: override.value } };
}

export function resolveContextualReference(
  currentNode: ComputedNode,
  reference: ContextualReferenceNode,
  aggregateLookup: AggregateLookupStore,
  metadata: MetadataBundle,
  kpiId?: string
): number | null {
  let ctx: NodeContext = { byDimension: { ...currentNode.context.byDimension } };
  addTrace(currentNode, "lookup:start", `Resolving ${reference.name}`, kpiId);

  for (const override of reference.overrides) {
    const nextCtx = resolveContextOverride(ctx, override, metadata);
    if (!nextCtx) {
      currentNode.missingReferences.push({
        kpiId: kpiId ?? "unknown_during_eval",
        referenceName: reference.name,
        contextKey: createContextKey(ctx)
      });
      currentNode.warnings.push(`Could not resolve ${override.value} for ${override.dimensionId}`);
      addTrace(currentNode, "lookup:failed", `Could not resolve ${override.dimensionId}=${String(override.value)}`, kpiId, {
        contextKey: createContextKey(ctx),
        referenceName: reference.name
      });
      return null;
    }
    ctx = nextCtx;
    addTrace(currentNode, "lookup:override", `Applied ${override.dimensionId}=${String(override.value)}`, kpiId, {
      contextKey: createContextKey(ctx),
      referenceName: reference.name
    });
  }

  const ctxKey = createContextKey(ctx);
  const bag = aggregateLookup.get(ctx);
  if (!bag) {
    currentNode.missingReferences.push({
      kpiId: kpiId ?? "unknown_during_eval",
      referenceName: reference.name,
      contextKey: ctxKey
    });
    currentNode.warnings.push(`Aggregate bag missing for resolved context ${ctxKey}`);
    addTrace(currentNode, "lookup:missing-bag", `No aggregate bag at ${ctxKey}`, kpiId, {
      contextKey: ctxKey,
      referenceName: reference.name
    });
    return null;
  }

  addTrace(currentNode, "lookup:resolved", `Resolved ${reference.name} at ${ctxKey}`, kpiId, {
    contextKey: ctxKey,
    referenceName: reference.name
  });
  return bag[reference.name] ?? null;
}

export function evaluateAstNode(ast: AstNode, currentNode: ComputedNode, aggregateLookup: AggregateLookupStore, metadata: MetadataBundle, kpiId?: string): number | null {
  switch (ast.kind) {
    case "numberLiteral":
      addTrace(currentNode, "eval:number", `Literal ${ast.value}`, kpiId);
      return ast.value;
    case "identifier":
      if (ast.name in currentNode.kpis) {
        addTrace(currentNode, "eval:kpi-ref", `Using prior KPI ${ast.name}`, kpiId);
        return currentNode.kpis[ast.name] ?? null;
      }
      if (ast.name in currentNode.baseAggregates) {
        addTrace(currentNode, "eval:measure-ref", `Using base aggregate ${ast.name}`, kpiId);
        return currentNode.baseAggregates[ast.name] ?? null;
      }
      addTrace(currentNode, "eval:missing-ref", `Missing identifier ${ast.name}`, kpiId);
      return null;
    case "contextualReference":
      return resolveContextualReference(currentNode, ast, aggregateLookup, metadata, kpiId);
    case "binaryOperation": {
      const left = evaluateAstNode(ast.left, currentNode, aggregateLookup, metadata, kpiId);
      const right = evaluateAstNode(ast.right, currentNode, aggregateLookup, metadata, kpiId);
      if (left == null || right == null) {
        addTrace(currentNode, "eval:binary-null", `Binary ${ast.operator} received null operand`, kpiId);
        return null;
      }
      let out: number | null = null;
      switch (ast.operator) {
        case "+": out = left + right; break;
        case "-": out = left - right; break;
        case "*": out = left * right; break;
        case "/": out = right === 0 ? null : left / right; break;
      }
      addTrace(currentNode, "eval:binary", `Computed ${left} ${ast.operator} ${right} = ${String(out)}`, kpiId);
      return out;
    }
    case "functionCall": {
      const args = ast.args.map(a => evaluateAstNode(a, currentNode, aggregateLookup, metadata, kpiId));
      const out = evalFunction(ast.functionName, args);
      addTrace(currentNode, "eval:function", `Computed ${ast.functionName}(${args.map(String).join(", ")}) = ${String(out)}`, kpiId);
      return out;
    }
  }
}

export function isKpiValidAtNodeLevel(kpi: KpiMetadata, node: ComputedNode): boolean {
  switch (node.nodeType) {
    case "leaf": return kpi.validAtLeaf;
    case "rowSubtotal":
    case "columnSubtotal": return kpi.validAtSubtotal;
    case "grandTotal": return kpi.validAtGrandTotal;
  }
}

export function applyMissingValuePolicy(kpi: KpiMetadata, raw: number | null, node: ComputedNode): number | null {
  if (raw != null) return raw;
  switch (kpi.missingValueBehavior) {
    case "zero":
      addTrace(node, "policy:zero", `Applied zero policy for ${kpi.id}`, kpi.id);
      return 0;
    case "warning":
      if (!node.warnings.includes(`Missing value for ${kpi.id}`)) node.warnings.push(`Missing value for ${kpi.id}`);
      addTrace(node, "policy:warning", `Applied warning policy for ${kpi.id}`, kpi.id);
      return null;
    default:
      addTrace(node, "policy:null", `Applied null policy for ${kpi.id}`, kpi.id);
      return null;
  }
}

export function evaluateKpisForNode(node: ComputedNode, runtimePlan: RuntimePlan, metadata: MetadataBundle, aggregateLookup: AggregateLookupStore): ComputedNode {
  const nextNode: ComputedNode = {
    ...node,
    kpis: { ...node.kpis },
    suppressedKpis: [...node.suppressedKpis],
    warnings: [...node.warnings],
    missingReferences: [...node.missingReferences],
    contributingRecords: [...node.contributingRecords],
    trace: [...node.trace]
  };

  for (const kpiId of runtimePlan.evaluationOrder) {
    const kpi = metadata.kpis[kpiId];
    if (!kpi) continue;
    addTrace(nextNode, "kpi:start", `Evaluating ${kpiId}`, kpiId);
    if (!isKpiValidAtNodeLevel(kpi, nextNode)) {
      nextNode.suppressedKpis.push(kpiId);
      nextNode.kpis[kpiId] = null;
      addTrace(nextNode, "kpi:suppressed", `${kpiId} suppressed at node type ${nextNode.nodeType}`, kpiId);
      continue;
    }
    const ast = runtimePlan.astByKpi[kpiId] as AstNode;
    const raw = evaluateAstNode(ast, nextNode, aggregateLookup, metadata, kpiId);
    nextNode.kpis[kpiId] = applyMissingValuePolicy(kpi, raw, nextNode);
    addTrace(nextNode, "kpi:end", `${kpiId} = ${String(nextNode.kpis[kpiId])}`, kpiId);
  }

  return nextNode;
}
