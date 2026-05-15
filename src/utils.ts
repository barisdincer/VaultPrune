import { normalizePath, type App, type TFile } from "obsidian";

interface AdapterWithBasePath {
  getBasePath: () => string;
}

export function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export function formatTimestamp(value: number): string {
  const date = new Date(value);
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

export function formatUtcTimestamp(value: string): string {
  const date = new Date(value);
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

export function getFileFolder(file: TFile): string {
  return file.parent?.path ?? "/";
}

export function getParentPath(path: string): string {
  const separatorIndex = path.lastIndexOf("/");
  if (separatorIndex === -1) {
    return "";
  }

  return path.slice(0, separatorIndex);
}

export function normalizeConfiguredFolderPath(entry: string, app?: App): string {
  const normalizedEntry = normalizePath(entry).replace(/\/$/, "");
  const vaultBasePath = app ? getVaultBasePath(app) : null;

  if (vaultBasePath) {
    const lowerEntry = normalizedEntry.toLowerCase();
    const lowerVaultBasePath = vaultBasePath.toLowerCase();

    if (lowerEntry === lowerVaultBasePath) {
      return "";
    }

    if (lowerEntry.startsWith(`${lowerVaultBasePath}/`)) {
      return normalizedEntry.slice(vaultBasePath.length + 1).replace(/\/$/, "");
    }
  }

  return normalizedEntry.replace(/^\/+/, "");
}

function getVaultBasePath(app: App): string | null {
  const adapter = app.vault.adapter as Partial<AdapterWithBasePath>;
  if (typeof adapter.getBasePath !== "function") {
    return null;
  }

  return normalizePath(adapter.getBasePath()).replace(/\/$/, "");
}
