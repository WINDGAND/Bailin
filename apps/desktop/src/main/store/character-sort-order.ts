/**
 * 角色仓库自定义排序：纯逻辑（可单测，不依赖 Electron / SQLite）。
 */

export class CharacterReorderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CharacterReorderError";
  }
}

/** 校验 reorder 传入的 id 列表是否与库内角色集合完全一致（顺序可变）。 */
export function validateCharacterReorderIds(
  existingIds: readonly string[],
  orderedIds: readonly string[]
): void {
  if (orderedIds.length !== existingIds.length) {
    throw new CharacterReorderError(
      `reorder id count mismatch: expected ${existingIds.length}, got ${orderedIds.length}`
    );
  }
  const existing = new Set(existingIds);
  const seen = new Set<string>();
  for (const id of orderedIds) {
    if (!existing.has(id)) {
      throw new CharacterReorderError(`unknown character id in reorder: ${id}`);
    }
    if (seen.has(id)) {
      throw new CharacterReorderError(`duplicate character id in reorder: ${id}`);
    }
    seen.add(id);
  }
  for (const id of existingIds) {
    if (!seen.has(id)) {
      throw new CharacterReorderError(`missing character id in reorder: ${id}`);
    }
  }
}

/** 按 updated_at 降序赋 0..n-1，用于首次迁移回填。 */
export function buildSortOrderBackfill(
  rows: ReadonlyArray<{ id: string; updated_at: number }>
): Array<{ id: string; sort_order: number }> {
  const sorted = [...rows].sort((a, b) => {
    if (b.updated_at !== a.updated_at) return b.updated_at - a.updated_at;
    return a.id.localeCompare(b.id);
  });
  return sorted.map((row, index) => ({ id: row.id, sort_order: index }));
}

/**
 * 新角色插到仓库最前：自身 sort_order=0，已有角色按当前顺序整体后移。
 * `existingSortedIds` 必须已是 list 展示顺序（sort_order ASC）。
 */
export function planInsertAtFront(
  existingSortedIds: readonly string[],
  newId: string
): Array<{ id: string; sort_order: number }> {
  return [
    { id: newId, sort_order: 0 },
    ...existingSortedIds.map((id, index) => ({ id, sort_order: index + 1 }))
  ];
}
