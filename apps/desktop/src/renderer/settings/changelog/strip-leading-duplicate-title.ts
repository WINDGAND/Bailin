function normalizeHeadingText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** Release body 常以 `# {title}` 开头，与条目标题重复时剥掉，避免双标题。 */
export function stripLeadingDuplicateTitle(notesMarkdown: string, title: string): string {
  const normalizedTitle = normalizeHeadingText(title);
  if (!normalizedTitle) return notesMarkdown;

  const trimmed = notesMarkdown.replace(/^\uFEFF/, "");
  const match = trimmed.match(/^#\s+(.+?)(?:\r?\n|$)/);
  if (!match) return notesMarkdown;

  if (normalizeHeadingText(match[1] ?? "") !== normalizedTitle) return notesMarkdown;

  return trimmed.slice(match[0].length).replace(/^\r?\n/, "");
}
