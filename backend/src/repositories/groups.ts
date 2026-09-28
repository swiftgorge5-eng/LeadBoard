/** Display names for configured repository groups. */
export const GROUP_LABELS: Record<string, string> = {
  "featured-open-source": "受关注仓库",
};

export function groupLabel(name: string): string {
  return GROUP_LABELS[name] ?? name;
}
