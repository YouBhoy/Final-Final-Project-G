import { readFile } from 'node:fs/promises';
import ts from 'typescript';
async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
  const resolved = outputText.replaceAll("'firebase/firestore'", JSON.stringify(import.meta.resolve('firebase/firestore')));
  return import(`data:text/javascript;base64,${Buffer.from(resolved).toString('base64')}`);
}
export const { buildStatistics, validateFilters, dateBoundary, validatedScore, SCALES } = await load('../../../../packages/shared-types/src/utils/statistics.ts');
export const { createStatisticsLoader, STATISTICS_FIELDS, MAX_STATISTICS_RECORDS } = await load('../../../../apps/web/src/lib/statisticsData.ts');
export const { createFirestoreStatisticsSource } = await load('../../../../apps/web/src/lib/statisticsSource.ts');
