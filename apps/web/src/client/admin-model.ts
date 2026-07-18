export function rootHealthMessage(online: boolean): string {
  return online
    ? "Online and readable"
    : "Unavailable. On macOS, grant Full Disk Access to Terminal/Codex or choose a readable directory.";
}

export function formatAdminDate(value: number | null | undefined): string {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(value) : "Never";
}
