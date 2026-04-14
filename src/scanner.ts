import {
  App,
  CachedMetadata,
  TAbstractFile,
  TFile,
  normalizePath,
  parseLinktext,
} from "obsidian";
import type { VaultPruneSettings } from "./settings";
import { getFileFolder, getParentPath } from "./utils";

const WIKI_LINK_PATTERN = /!?\[\[([^[\]]+)\]\]/g;
const MARKDOWN_LINK_PATTERN = /!?\[[^\]]*]\(([^)]+)\)/g;
const QUOTED_PATH_PATTERN = /["'`]((?:\.{1,2}\/|\/)?[^"'`\n\r]+?\.[A-Za-z0-9]{1,12})["'`]/g;

interface CanvasNodeLike {
  background?: unknown;
  file?: unknown;
  text?: unknown;
}

interface CanvasDataLike {
  nodes?: CanvasNodeLike[];
}

interface ScanFilters {
  attachmentFolders: string[];
  ignoredFolders: string[];
  allowedExtensions: Set<string>;
  extraReferenceExtensions: Set<string>;
}

export interface AttachmentCandidate {
  extension: string;
  file: TFile;
  folder: string;
  modifiedTime: number;
  path: string;
  sizeBytes: number;
}

export interface ScanSummary {
  scannedExtraReferenceFiles: number;
  generatedAt: string;
  referencedAttachmentCount: number;
  scannedAttachmentFiles: number;
  scannedCanvasFiles: number;
  scannedMarkdownFiles: number;
  unusedBytes: number;
  unusedCandidates: AttachmentCandidate[];
}

export async function scanVault(
  app: App,
  settings: VaultPruneSettings,
): Promise<ScanSummary> {
  const allFiles = app.vault.getFiles();
  const markdownFiles = app.vault.getMarkdownFiles();
  const canvasFiles = allFiles.filter((file) => file.extension.toLowerCase() === "canvas");
  const filters = buildScanFilters(settings);
  const extraReferenceFiles = allFiles.filter((file) => isExtraReferenceFile(file, filters));
  const referencedPaths = new Set<string>();

  collectMarkdownReferences(app, markdownFiles, referencedPaths, filters);
  await collectCanvasReferences(app, canvasFiles, referencedPaths, filters);
  await collectExtraReferenceFiles(app, extraReferenceFiles, referencedPaths, filters);

  const attachmentCandidates = allFiles
    .filter((file) => isAttachmentCandidate(file, filters))
    .map(createAttachmentCandidate);

  const unusedCandidates = attachmentCandidates
    .filter((candidate) => !referencedPaths.has(candidate.path))
    .sort((left, right) => left.path.localeCompare(right.path));

  const unusedBytes = unusedCandidates.reduce(
    (total, candidate) => total + candidate.sizeBytes,
    0,
  );

  return {
    scannedExtraReferenceFiles: extraReferenceFiles.length,
    generatedAt: new Date().toISOString(),
    referencedAttachmentCount: referencedPaths.size,
    scannedAttachmentFiles: attachmentCandidates.length,
    scannedCanvasFiles: canvasFiles.length,
    scannedMarkdownFiles: markdownFiles.length,
    unusedBytes,
    unusedCandidates,
  };
}

function buildScanFilters(settings: VaultPruneSettings): ScanFilters {
  return {
    attachmentFolders: parseFolderList(settings.attachmentFolders),
    ignoredFolders: parseFolderList(settings.ignoredFolders),
    allowedExtensions: parseExtensionList(settings.attachmentExtensions),
    extraReferenceExtensions: parseExtensionList(settings.extraReferenceExtensions),
  };
}

function createAttachmentCandidate(file: TFile): AttachmentCandidate {
  return {
    extension: file.extension.toLowerCase(),
    file,
    folder: getFileFolder(file),
    modifiedTime: file.stat.mtime,
    path: file.path,
    sizeBytes: file.stat.size,
  };
}

function collectMarkdownReferences(
  app: App,
  markdownFiles: TFile[],
  referencedPaths: Set<string>,
  filters: ScanFilters,
): void {
  for (const markdownFile of markdownFiles) {
    const cache = app.metadataCache.getFileCache(markdownFile);
    if (!cache) {
      continue;
    }

    collectCachedReferences(app, cache, markdownFile.path, referencedPaths, filters);
  }
}

async function collectCanvasReferences(
  app: App,
  canvasFiles: TFile[],
  referencedPaths: Set<string>,
  filters: ScanFilters,
): Promise<void> {
  for (const canvasFile of canvasFiles) {
    try {
      const raw = await app.vault.cachedRead(canvasFile);
      const parsed = JSON.parse(raw) as CanvasDataLike;
      const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];

      for (const node of nodes) {
        if (typeof node.file === "string") {
          addReferenceTarget(app, node.file, canvasFile.path, referencedPaths, filters);
        }

        if (typeof node.background === "string") {
          addReferenceTarget(app, node.background, canvasFile.path, referencedPaths, filters);
        }

        if (typeof node.text === "string") {
          const inlineLinks = extractCanvasTextLinkPaths(node.text);
          for (const linkPath of inlineLinks) {
            addReferenceTarget(app, linkPath, canvasFile.path, referencedPaths, filters);
          }
        }
      }
    } catch (error) {
      console.error("VaultPrune canvas parse failed", canvasFile.path, error);
    }
  }
}

async function collectExtraReferenceFiles(
  app: App,
  referenceFiles: TFile[],
  referencedPaths: Set<string>,
  filters: ScanFilters,
): Promise<void> {
  for (const referenceFile of referenceFiles) {
    try {
      const raw = await app.vault.cachedRead(referenceFile);
      const extractedPaths = extractTextReferencePaths(raw);
      for (const linkPath of extractedPaths) {
        addReferenceTarget(app, linkPath, referenceFile.path, referencedPaths, filters);
      }
    } catch (error) {
      console.error("VaultPrune extra reference scan failed", referenceFile.path, error);
    }
  }
}

function collectCachedReferences(
  app: App,
  cache: CachedMetadata,
  sourcePath: string,
  referencedPaths: Set<string>,
  filters: ScanFilters,
): void {
  const references = [
    ...(cache.links ?? []),
    ...(cache.embeds ?? []),
    ...(cache.frontmatterLinks ?? []),
    ...(cache.referenceLinks ?? []),
  ];

  for (const reference of references) {
    addReferenceTarget(app, reference.link, sourcePath, referencedPaths, filters);
  }
}

function addReferenceTarget(
  app: App,
  linkPath: string,
  sourcePath: string,
  referencedPaths: Set<string>,
  filters: ScanFilters,
): void {
  const target = resolveFileReference(app, linkPath, sourcePath);
  if (target instanceof TFile && isAttachmentCandidate(target, filters)) {
    referencedPaths.add(target.path);
  }
}

function resolveFileReference(
  app: App,
  linkPath: string,
  sourcePath: string,
): TAbstractFile | null {
  const sanitizedPath = sanitizeReferencePath(linkPath);
  if (!sanitizedPath) {
    return null;
  }

  const resolvedByMetadata = app.metadataCache.getFirstLinkpathDest(sanitizedPath, sourcePath);
  if (resolvedByMetadata) {
    return resolvedByMetadata;
  }

  const directPath = normalizePath(stripLeadingSlash(sanitizedPath));
  const exactMatch = app.vault.getAbstractFileByPath(directPath);
  if (exactMatch) {
    return exactMatch;
  }

  if (sanitizedPath.startsWith("./") || sanitizedPath.startsWith("../")) {
    const sourceFolder = getParentPath(sourcePath);
    const relativePath = sourceFolder
      ? normalizePath(`${sourceFolder}/${sanitizedPath}`)
      : normalizePath(sanitizedPath);
    return app.vault.getAbstractFileByPath(relativePath);
  }

  return null;
}

function sanitizeReferencePath(linkPath: string): string | null {
  let value = linkPath.trim();
  if (!value) {
    return null;
  }

  if (value.startsWith("<") && value.endsWith(">")) {
    value = value.slice(1, -1).trim();
  }

  const titleMatch = value.match(/^(.+?)\s+(?:"[^"]*"|'[^']*')$/);
  if (titleMatch?.[1]) {
    value = titleMatch[1].trim();
  }

  const parsed = parseLinktext(value);
  const normalizedPath = parsed.path || value;
  if (!normalizedPath || normalizedPath.startsWith("#") || isExternalReference(normalizedPath)) {
    return null;
  }

  return normalizedPath;
}

function extractCanvasTextLinkPaths(text: string): string[] {
  return extractTextReferencePaths(text);
}

function extractTextReferencePaths(text: string): string[] {
  const paths = new Set<string>();

  let wikiMatch: RegExpExecArray | null;
  WIKI_LINK_PATTERN.lastIndex = 0;
  while ((wikiMatch = WIKI_LINK_PATTERN.exec(text)) !== null) {
    const rawTarget = wikiMatch[1]?.trim();
    if (!rawTarget) {
      continue;
    }

    const withoutAlias = rawTarget.split("|")[0]?.trim() ?? "";
    const parsed = parseLinktext(withoutAlias);
    const candidatePath = parsed.path || withoutAlias;
    if (candidatePath && !isExternalReference(candidatePath)) {
      paths.add(candidatePath);
    }
  }

  let markdownMatch: RegExpExecArray | null;
  MARKDOWN_LINK_PATTERN.lastIndex = 0;
  while ((markdownMatch = MARKDOWN_LINK_PATTERN.exec(text)) !== null) {
    const destination = sanitizeReferencePath(markdownMatch[1] ?? "");
    if (destination) {
      paths.add(destination);
    }
  }

  let quotedPathMatch: RegExpExecArray | null;
  QUOTED_PATH_PATTERN.lastIndex = 0;
  while ((quotedPathMatch = QUOTED_PATH_PATTERN.exec(text)) !== null) {
    const destination = sanitizeReferencePath(quotedPathMatch[1] ?? "");
    if (destination) {
      paths.add(destination);
    }
  }

  return [...paths];
}

function isAttachmentCandidate(file: TFile, filters: ScanFilters): boolean {
  const extension = file.extension.toLowerCase();
  if (!filters.allowedExtensions.has(extension)) {
    return false;
  }

  if (isInConfiguredFolder(file.path, filters.ignoredFolders)) {
    return false;
  }

  if (filters.attachmentFolders.length === 0) {
    return true;
  }

  return isInConfiguredFolder(file.path, filters.attachmentFolders);
}

function isExtraReferenceFile(
  file: TFile,
  filters: ScanFilters,
): boolean {
  const extension = file.extension.toLowerCase();
  if (!filters.extraReferenceExtensions.has(extension)) {
    return false;
  }

  if (extension === "md" || extension === "canvas") {
    return false;
  }

  return !isInConfiguredFolder(file.path, filters.ignoredFolders);
}

function parseFolderList(value: string): string[] {
  return value
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => normalizePath(entry).replace(/\/$/, ""));
}

function parseExtensionList(value: string): Set<string> {
  return new Set(
    value
      .split(/[,\n]/)
      .map((entry) => entry.trim().replace(/^\./, "").toLowerCase())
      .filter(Boolean),
  );
}

function isInConfiguredFolder(path: string, folders: string[]): boolean {
  return folders.some((folder) => path === folder || path.startsWith(`${folder}/`));
}

function isExternalReference(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//");
}

function stripLeadingSlash(value: string): string {
  return value.replace(/^\/+/, "");
}
