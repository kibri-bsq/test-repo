import type { DependencyGraph, KpiMetadata, MetadataBundle } from "@engine/engine-model";
import type { AstNode } from "@engine/formula-parser";

export function extractDependenciesFromAst(ast: AstNode): string[] {
  const deps = new Set<string>();
  function walk(node: AstNode): void {
    switch (node.kind) {
      case "numberLiteral":
        return;
      case "identifier":
      case "contextualReference":
        deps.add(node.name);
        return;
      case "binaryOperation":
        walk(node.left);
        walk(node.right);
        return;
      case "functionCall":
        for (const arg of node.args) walk(arg);
        return;
    }
  }
  walk(ast);
  return [...deps];
}

export function buildDependencyGraph(
  selectedKpis: KpiMetadata[],
  astByKpi: Record<string, AstNode>,
  metadata: MetadataBundle
): { graph: DependencyGraph; cycles: string[][] } {
  const kpiIds = new Set(selectedKpis.map(k => k.id));
  const measureIds = new Set(Object.keys(metadata.measures));
  const edges: Record<string, string[]> = {};
  for (const kpi of selectedKpis) {
    const refs = extractDependenciesFromAst(astByKpi[kpi.id]);
    edges[kpi.id] = [...new Set(refs.filter(ref => kpiIds.has(ref) && !measureIds.has(ref)))];
  }
  return { graph: { nodes: [...kpiIds], edges }, cycles: [] };
}

export function topologicallySortGraph(graph: DependencyGraph): string[] {
  const visited = new Set<string>();
  const temp = new Set<string>();
  const order: string[] = [];
  function visit(node: string) {
    if (temp.has(node)) throw new Error(`Cycle at ${node}`);
    if (visited.has(node)) return;
    temp.add(node);
    for (const dep of graph.edges[node] ?? []) visit(dep);
    temp.delete(node);
    visited.add(node);
    order.push(node);
  }
  for (const node of graph.nodes) visit(node);
  return order;
}
