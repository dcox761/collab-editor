import * as Y from 'yjs';

export interface EditOperation {
  search: string;
  replace: string;
}

export interface EditResult {
  search: string;
  replace: string;
  applied: boolean;
  reason?: string; // 'not found' when search text not in document
}

/**
 * Apply AI-generated surgical edits to a Y.Text instance.
 * All edits are applied in a single Y.js transaction for atomicity.
 * Edits are processed in reverse document order so position shifts
 * from earlier edits don't affect later ones.
 * If a search string matches multiple locations, the first occurrence is used.
 */
export function applyAiEdits(yText: Y.Text, edits: EditOperation[]): EditResult[] {
  const results: EditResult[] = new Array(edits.length);

  yText.doc!.transact(() => {
    // Map each edit to its first occurrence position
    const sortedEdits = edits.map((edit, i) => ({
      ...edit,
      originalIndex: i,
      position: yText.toString().indexOf(edit.search),
    }));

    // Sort by position descending so later edits don't shift earlier ones
    sortedEdits.sort((a, b) => b.position - a.position);

    for (const edit of sortedEdits) {
      const content = yText.toString();
      const index = content.indexOf(edit.search);

      if (index === -1) {
        results[edit.originalIndex] = {
          search: edit.search,
          replace: edit.replace,
          applied: false,
          reason: 'not found',
        };
        continue;
      }

      // If multiple matches exist, apply to the first occurrence
      yText.delete(index, edit.search.length);
      yText.insert(index, edit.replace);
      results[edit.originalIndex] = {
        search: edit.search,
        replace: edit.replace,
        applied: true,
      };
    }
  }, 'ai-edit'); // origin tag for identifying AI edits

  return results;
}
