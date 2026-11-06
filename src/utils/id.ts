/** Small unique id; collisions are irrelevant at the scale of a shoot day. */
export function makeId(prefix = ''): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}${Date.now().toString(36)}${rand}`;
}
