const UMLAUT_MAP: Record<string, string> = {
  'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss',
  'Ä': 'ae', 'Ö': 'oe', 'Ü': 'ue',
};

export function slugify(input: string): string {
  let s = input;
  for (const [u, r] of Object.entries(UMLAUT_MAP)) s = s.split(u).join(r);
  s = s.toLowerCase();
  s = s.replace(/[^a-z0-9]+/g, '-');
  s = s.replace(/-+/g, '-');
  s = s.replace(/^-|-$/g, '');
  return s;
}

export async function ensureUniqueSlug(base: string, existing: Set<string>): Promise<string> {
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
