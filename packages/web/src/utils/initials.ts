/** Returns uppercase initials from a name, e.g. "Hieu Nguyen" -> "HN". */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}
