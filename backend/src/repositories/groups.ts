/** Display names used by the organization's osd_sig assignments. */
export const GROUP_LABELS: Record<string, string> = {
  hustmirror: "镜像站运维 SIG",
  "linux-kernel": "Linux 内核 SIG",
  r2: "R² SIG",
  hctt: "HCTT SIG",
  pwnhustcollege: "pwn.hust.college SIG",
  infrastructure: "数字基础设施维护 SIG",
  llmagent: "Agent SIG",
  openharmony: "OpenHarmony SIG",
  rtthread: "RT-thread SIG",
  "featured-open-source": "受关注仓库",
};

export function groupLabel(name: string): string {
  return GROUP_LABELS[name] ?? name;
}
