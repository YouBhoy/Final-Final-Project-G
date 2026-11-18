import type { PassCell, PassRelation } from './files/suppressionPass';

export type PublishedValue =
  | { kind: 'exact'; value: number }
  | { kind: 'fewerThan5'; value: null }
  | { kind: 'notShown'; value: null };

export interface PublishedDocument {
  id: string;
  cells: Record<string, PublishedValue>;
  relations?: readonly { id: string; total: string; parts: readonly string[] }[];
  derivedConstraints?: readonly { id: string; cells: readonly string[]; lower: number; upper: number }[];
}

export interface DisclosureInput {
  cells: PassCell[];
  relations: PassRelation[];
}

/**
 * Converts public documents into the exact cell/total representation used by
 * the secondary suppression pass.
 */
export function disclosureConstraints(documents: readonly PublishedDocument[]): DisclosureInput {
  const cells = new Map<string, PassCell>();
  const relations: PassRelation[] = [];

  for (const document of documents) {
    for (const [name, published] of Object.entries(document.cells)) {
      const id = `${document.id}.${name}`;
      if (cells.has(id)) throw new Error(`Duplicate disclosure cell: ${id}`);
      if (published.kind === 'exact') {
        if (!Number.isInteger(published.value) || published.value < 0) {
          throw new Error(`Invalid published value: ${id}`);
        }
        cells.set(id, { id, value: published.value, aggregate: name.includes('total') || name === 'institution' });
      } else if (published.kind === 'fewerThan5') {
        if (published.value !== null) throw new Error(`Fewer-than-5 cells must not contain a value: ${id}`);
        cells.set(id, { id, value: 1, aggregate: false });
      } else {
        cells.set(id, { id, value: 0, aggregate: false });
      }
    }
    for (const relation of document.relations ?? []) {
      relations.push({
        id: `${document.id}.${relation.id}`,
        total: `${document.id}.${relation.total}`,
        parts: relation.parts.map(part => `${document.id}.${part}`),
      });
    }
  }

  for (const relation of relations) {
    if (!cells.has(relation.total) || relation.parts.some(part => !cells.has(part))) {
      throw new Error(`Unknown disclosure cell in relation ${relation.id}`);
    }
  }

  return { cells: [...cells.values()], relations };
}
