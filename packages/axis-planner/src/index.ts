import type { AxisOrderingConfig } from "@engine/contracts";

export interface AxisNode {
  key: string;
  label: string;
  kind: "member" | "derived_kpi" | "subtotal" | "grand_total";
  children?: AxisNode[];
}

export interface PlannedColumnAxis {
  orderedColumnKeys: string[];
  axisTree: AxisNode[];
}

function nodeKindFromToken(token: string): AxisNode["kind"] {
  if (token === "__GRAND_TOTAL__") return "grand_total";
  if (token === "__TOTAL__") return "subtotal";
  return "member";
}

function sortTokensWithSequence(tokens: string[], sequence?: string[]) {
  if (!sequence || sequence.length === 0) return [...tokens];
  const rank = new Map(sequence.map((t, i) => [t, i]));
  return [...tokens].sort((a, b) => {
    const ra = rank.has(a) ? rank.get(a)! : Number.MAX_SAFE_INTEGER;
    const rb = rank.has(b) ? rank.get(b)! : Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
}

export function planMixedColumnAxis(params: {
  baseColumnKeys: string[];
  placementPlans: Record<string, any>;
  columnDimensions: string[];
  axisOrdering?: AxisOrderingConfig;
}): PlannedColumnAxis {
  const { baseColumnKeys, placementPlans, columnDimensions, axisOrdering } = params;
  const ordering = axisOrdering?.column ?? {};
  const ordered = new Set<string>();
  const resultKeys: string[] = [];

  // Group derived KPIs by anchor dimension
  const derivedByAnchor = new Map<string, string[]>();
  for (const [kpiId, plan] of Object.entries(placementPlans ?? {})) {
    const anchor = plan?.displayInjection?.anchorDimension;
    if (plan?.displayInjection?.type === "derived_column" && anchor) {
      if (!derivedByAnchor.has(anchor)) derivedByAnchor.set(anchor, []);
      derivedByAnchor.get(anchor)!.push(kpiId);
    }
  }

  // If no column dimensions or no ordering rule, return original order
  if (columnDimensions.length === 0) {
    return {
      orderedColumnKeys: [...baseColumnKeys],
      axisTree: baseColumnKeys.map((k) => ({ key: k, label: k, kind: nodeKindFromToken(k) }))
    };
  }

  // Build order per last column dimension band by parent prefix
  const anchorDim = [...derivedByAnchor.keys()][0];
  const anchorIndex = anchorDim ? columnDimensions.indexOf(anchorDim) : -1;

  if (anchorIndex < 0) {
    return {
      orderedColumnKeys: [...baseColumnKeys],
      axisTree: baseColumnKeys.map((k) => ({ key: k, label: k, kind: nodeKindFromToken(k) }))
    };
  }

  const groups = new Map<string, string[]>();
  for (const key of baseColumnKeys) {
    const parts = key.split("¦");
    const prefix = parts.slice(0, anchorIndex).join("¦");
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix)!.push(key);
  }

  for (const [prefix, keys] of groups.entries()) {
    const memberTokens = Array.from(new Set(keys.map((k) => k.split("¦")[anchorIndex] ?? "")));
    const derivedTokens = derivedByAnchor.get(anchorDim) ?? [];
    const combined = Array.from(new Set([...memberTokens, ...derivedTokens]));
    const orderedTokens = sortTokensWithSequence(combined, ordering[anchorDim]);

    for (const token of orderedTokens) {
      const match = keys.find((k) => (k.split("¦")[anchorIndex] ?? "") === token);
      const key = match ?? (prefix ? `${prefix}¦${token}` : token);
      if (!ordered.has(key)) {
        ordered.add(key);
        resultKeys.push(key);
      }
    }
  }

  // Preserve any columns not covered above
  for (const k of baseColumnKeys) {
    if (!ordered.has(k)) resultKeys.push(k);
  }

  return {
    orderedColumnKeys: resultKeys,
    axisTree: resultKeys.map((k) => {
      const label = k.split("¦").slice(-1)[0] ?? k;
      const kind = derivedByAnchor.get(anchorDim)?.includes(label) ? "derived_kpi" : nodeKindFromToken(label);
      return { key: k, label, kind };
    })
  };
}
