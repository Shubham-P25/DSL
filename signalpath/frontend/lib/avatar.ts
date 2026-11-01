export function avatarInitials(name?: string | null): string {
  const parts = (name ?? "Speaker").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join("") || "SP";
}
