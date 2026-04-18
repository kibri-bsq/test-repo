import { executeView } from "@engine/execution-engine";
import { examples } from "@engine/test-data";

export interface BenchmarkResult {
  name: string;
  executionMs: number;
  cellCount: number;
  rowCount: number;
  colCount: number;
}

export function runBenchmarks(): BenchmarkResult[] {
  const results: BenchmarkResult[] = [];
  for (const example of examples) {
    const start = performance.now();
    const result = executeView(example.request as any, example.payload as any, example.metadata as any) as any;
    const end = performance.now();
    results.push({
      name: example.name,
      executionMs: Math.round((end - start) * 100) / 100,
      cellCount: result.matrix.cells.length,
      rowCount: result.matrix.rowHeaders.length,
      colCount: result.matrix.columnHeaders.length
    });
  }
  return results;
}
