import { App, Modal, Notice, Setting, setIcon } from "obsidian";
import type VaultPrunePlugin from "./main";
import type { AttachmentCandidate, ScanSummary } from "./scanner";
import { formatBytes, formatTimestamp, normalizeConfiguredFolderPath } from "./utils";

type SortOrder = "extension" | "modified-desc" | "path" | "size-desc";

const IMAGE_PREVIEW_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "heic",
  "ico",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp",
]);

const VIDEO_PREVIEW_EXTENSIONS = new Set([
  "mkv",
  "mov",
  "mp4",
  "webm",
]);

const AUDIO_EXTENSIONS = new Set([
  "flac",
  "m4a",
  "mp3",
  "ogg",
  "wav",
]);

const ARCHIVE_EXTENSIONS = new Set(["7z", "rar", "zip"]);
const DOCUMENT_EXTENSIONS = new Set([
  "doc",
  "docx",
  "epub",
  "pdf",
  "ppt",
  "pptx",
  "xls",
  "xlsx",
]);

export class VaultPruneReviewModal extends Modal {
  private currentSummary: ScanSummary | null = null;
  private extensionFilter = "all";
  private pathQuery = "";
  private plugin: VaultPrunePlugin;
  private selectedPaths = new Set<string>();
  private sortOrder: SortOrder = "path";

  constructor(app: App, plugin: VaultPrunePlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen(): void {
    this.modalEl.addClass("vaultprune-modal");
    void this.refresh();
  }

  onClose(): void {
    this.contentEl.empty();
    this.modalEl.removeClass("vaultprune-modal");
  }

  private async refresh(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: "Review unused attachments" });
    this.contentEl.createDiv({
      cls: "vaultprune-summary",
      text: "Scanning your vault for unreferenced attachment candidates...",
    });

    try {
      const summary = await this.plugin.createScanSummary();
      this.currentSummary = summary;
      this.selectedPaths = new Set(summary.unusedCandidates.map((candidate) => candidate.path));
      this.render(summary);
    } catch (error) {
      console.error("VaultPrune scan failed", error);
      this.contentEl.empty();
      this.contentEl.createEl("h2", { text: "Review unused attachments" });
      this.contentEl.createDiv({
        cls: "vaultprune-empty",
        text: "Could not complete the scan. Check the developer console for details.",
      });
    }
  }

  private render(summary: ScanSummary): void {
    const { contentEl } = this;
    const visibleCandidates = this.getVisibleCandidates(summary);
    const visibleBytes = sumCandidateBytes(visibleCandidates);
    const selectedVisibleCandidates = visibleCandidates.filter((candidate) =>
      this.selectedPaths.has(candidate.path),
    );
    const selectedVisibleBytes = sumCandidateBytes(selectedVisibleCandidates);
    const selectedAllCandidates = summary.unusedCandidates.filter((candidate) =>
      this.selectedPaths.has(candidate.path),
    );

    contentEl.empty();
    contentEl.createEl("h2", { text: "Unused attachment review" });
    this.renderScanOverview(
      contentEl,
      summary,
      visibleCandidates.length,
      visibleBytes,
      selectedVisibleCandidates.length,
      selectedVisibleBytes,
      selectedAllCandidates.length,
    );

    this.renderControls(contentEl, summary, visibleCandidates);

    if (summary.unusedCandidates.length === 0) {
      contentEl.createDiv({
        cls: "vaultprune-empty",
        text: "No unused attachment candidates were found with the current settings.",
      });
      return;
    }

    if (visibleCandidates.length === 0) {
      contentEl.createDiv({
        cls: "vaultprune-empty",
        text: "No candidates match the current search and extension filters.",
      });
      return;
    }

    contentEl.createEl("h3", { text: "Files to review" });
    contentEl.createDiv({
      cls: "vaultprune-section-note",
      text:
        "These files are in your attachment folders, but VaultPrune did not find a note, Canvas, or configured reference file pointing to them.",
    });

    const listEl = contentEl.createDiv({ cls: "vaultprune-file-list" });
    for (const candidate of visibleCandidates) {
      this.renderCandidateRow(listEl, summary, candidate);
    }
  }

  private renderScanOverview(
    parentEl: HTMLElement,
    summary: ScanSummary,
    visibleCount: number,
    visibleBytes: number,
    selectedVisibleCount: number,
    selectedVisibleBytes: number,
    selectedOverallCount: number,
  ): void {
    parentEl.createDiv({
      cls: "vaultprune-summary",
      text:
        "VaultPrune checked your vault references and found attachment files that look unused. " +
        "Open a file if you are unsure, ignore files you want to keep, and move only reviewed files to trash.",
    });

    const statsEl = parentEl.createDiv({ cls: "vaultprune-stats" });
    renderStat(
      statsEl,
      "Needs review",
      String(summary.unusedCandidates.length),
      formatBytes(summary.unusedBytes),
    );
    renderStat(statsEl, "Visible now", String(visibleCount), formatBytes(visibleBytes));
    renderStat(
      statsEl,
      "Selected",
      String(selectedOverallCount),
      `${selectedVisibleCount} visible, ${formatBytes(selectedVisibleBytes)}`,
    );
    renderStat(
      statsEl,
      "Scan scope",
      `${summary.scannedAttachmentFiles} files`,
      `${summary.referencedAttachmentCount} referenced`,
    );

    parentEl.createDiv({
      cls: "vaultprune-scan-scope",
      text:
        `${summary.scannedMarkdownFiles} Markdown notes, ` +
        `${summary.scannedCanvasFiles} Canvas files, and ` +
        `${summary.scannedExtraReferenceFiles} extra reference files were checked.`,
    });
  }

  private renderControls(
    parentEl: HTMLElement,
    summary: ScanSummary,
    visibleCandidates: AttachmentCandidate[],
  ): void {
    const toolbarEl = parentEl.createDiv({ cls: "vaultprune-toolbar" });
    const extensionOptions = getExtensionOptions(summary.unusedCandidates);

    const searchFieldEl = createControlField(toolbarEl, "Search", "Path, folder, or extension");
    const searchInputEl = searchFieldEl.createEl("input", { cls: "vaultprune-control-input" });
    searchInputEl.type = "text";
    searchInputEl.placeholder = "Example: attachments/logo.png";
    searchInputEl.value = this.pathQuery;
    searchInputEl.addEventListener("input", () => {
      this.pathQuery = searchInputEl.value;
      this.render(summary);
    });

    const extensionFieldEl = createControlField(toolbarEl, "Extension", "Show one type");
    const extensionSelectEl = extensionFieldEl.createEl("select", {
      cls: "vaultprune-control-input",
    });
    addSelectOption(extensionSelectEl, "all", "All extensions");
    for (const option of extensionOptions) {
      addSelectOption(extensionSelectEl, option, `.${option}`);
    }
    extensionSelectEl.value = this.extensionFilter;
    extensionSelectEl.addEventListener("change", () => {
      this.extensionFilter = extensionSelectEl.value;
      this.render(summary);
    });

    const sortFieldEl = createControlField(toolbarEl, "Sort", "Choose list order");
    const sortSelectEl = sortFieldEl.createEl("select", { cls: "vaultprune-control-input" });
    addSelectOption(sortSelectEl, "path", "Path");
    addSelectOption(sortSelectEl, "size-desc", "Largest first");
    addSelectOption(sortSelectEl, "modified-desc", "Recently modified");
    addSelectOption(sortSelectEl, "extension", "Extension");
    sortSelectEl.value = this.sortOrder;
    sortSelectEl.addEventListener("change", () => {
      this.sortOrder = sortSelectEl.value as SortOrder;
      this.render(summary);
    });

    const actionRow = parentEl.createDiv({ cls: "vaultprune-actions" });
    const refreshButtonEl = actionRow.createEl("button", { text: "Refresh scan" });
    refreshButtonEl.addEventListener("click", () => {
      void this.refresh();
    });

    const resetButtonEl = actionRow.createEl("button", { text: "Reset filters" });
    resetButtonEl.addEventListener("click", () => {
      this.pathQuery = "";
      this.extensionFilter = "all";
      this.sortOrder = "path";
      this.render(summary);
    });

    const selectButtonEl = actionRow.createEl("button", { text: "Select visible" });
    selectButtonEl.addEventListener("click", () => {
      for (const candidate of visibleCandidates) {
        this.selectedPaths.add(candidate.path);
      }
      this.render(summary);
    });

    const clearButtonEl = actionRow.createEl("button", { text: "Clear visible" });
    clearButtonEl.addEventListener("click", () => {
      for (const candidate of visibleCandidates) {
        this.selectedPaths.delete(candidate.path);
      }
      this.render(summary);
    });

    const reportButtonEl = actionRow.createEl("button", { text: "Preview report" });
    reportButtonEl.classList.add("mod-cta");
    reportButtonEl.addEventListener("click", () => {
      this.plugin.openPreviewReport(
        summary,
        visibleCandidates,
        this.selectedPaths,
        "Preview unused attachments report",
        "Preview only. This report reflects the current filtered view.",
      );
    });

    const trashButtonEl = actionRow.createEl("button", { text: "Move selected to trash" });
    trashButtonEl.classList.add("mod-warning");
    trashButtonEl.disabled = this.selectedPaths.size === 0;
    trashButtonEl.addEventListener("click", () => {
      void this.trashSelected();
    });
  }

  private renderCandidateRow(
    parentEl: HTMLElement,
    summary: ScanSummary,
    candidate: AttachmentCandidate,
  ): void {
    const rowEl = parentEl.createDiv({ cls: "vaultprune-file-row" });
    const checkboxEl = rowEl.createEl("input");
    checkboxEl.type = "checkbox";
    checkboxEl.checked = this.selectedPaths.has(candidate.path);
    checkboxEl.addEventListener("change", () => {
      if (checkboxEl.checked) {
        this.selectedPaths.add(candidate.path);
      } else {
        this.selectedPaths.delete(candidate.path);
      }

      this.render(summary);
    });

    this.renderCandidatePreview(rowEl, candidate);

    const detailsEl = rowEl.createDiv({ cls: "vaultprune-file-details" });
    detailsEl.createDiv({
      cls: "vaultprune-file-path",
      text: candidate.path,
    });
    detailsEl.createDiv({
      cls: "vaultprune-file-status",
      text: "No reference found in the scanned notes or Canvas files.",
    });
    detailsEl.createDiv({
      cls: "vaultprune-file-meta",
      text:
        `.${candidate.extension}  |  ${candidate.folder}  |  ` +
        `modified ${formatTimestamp(candidate.modifiedTime)}`,
    });

    rowEl.createDiv({
      cls: "vaultprune-file-size",
      text: formatBytes(candidate.sizeBytes),
    });

    const actionEl = rowEl.createDiv({ cls: "vaultprune-file-actions" });
    const openButton = actionEl.createEl("button", { text: "Open" });
    openButton.addEventListener("click", () => {
      void this.app.workspace.getLeaf(true).openFile(candidate.file);
    });

    const ignoreButton = actionEl.createEl("button", { text: "Ignore" });
    ignoreButton.addEventListener("click", () => {
      void this.ignoreCandidate(candidate);
    });
  }

  private renderCandidatePreview(parentEl: HTMLElement, candidate: AttachmentCandidate): void {
    const previewEl = parentEl.createDiv({ cls: "vaultprune-file-preview" });
    previewEl.setAttribute("aria-label", `Preview for ${candidate.path}`);

    if (IMAGE_PREVIEW_EXTENSIONS.has(candidate.extension)) {
      this.makePreviewClickable(previewEl, candidate);
      const imageEl = previewEl.createEl("img", { cls: "vaultprune-file-preview-media" });
      imageEl.alt = "";
      imageEl.loading = "lazy";
      imageEl.src = this.app.vault.getResourcePath(candidate.file);
      imageEl.addEventListener("error", () => {
        this.renderPreviewBadge(previewEl, candidate.extension);
      });
      return;
    }

    if (VIDEO_PREVIEW_EXTENSIONS.has(candidate.extension)) {
      this.makePreviewClickable(previewEl, candidate);
      const videoEl = previewEl.createEl("video", { cls: "vaultprune-file-preview-media" });
      videoEl.muted = true;
      videoEl.preload = "metadata";
      videoEl.src = this.app.vault.getResourcePath(candidate.file);
      videoEl.addEventListener("error", () => {
        this.renderPreviewBadge(previewEl, candidate.extension);
      });
      return;
    }

    this.renderPreviewBadge(previewEl, candidate.extension);
  }

  private makePreviewClickable(previewEl: HTMLElement, candidate: AttachmentCandidate): void {
    previewEl.addClass("vaultprune-file-preview-clickable");
    previewEl.tabIndex = 0;
    previewEl.setAttribute("role", "button");
    previewEl.setAttribute("aria-label", `Open larger preview for ${candidate.path}`);
    previewEl.addEventListener("click", () => {
      new AttachmentPreviewModal(this.app, candidate).open();
    });
    previewEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        new AttachmentPreviewModal(this.app, candidate).open();
      }
    });
  }

  private renderPreviewBadge(previewEl: HTMLElement, extension: string): void {
    renderPreviewBadgeContent(previewEl, extension);
  }

  private async ignoreCandidate(candidate: AttachmentCandidate): Promise<void> {
    const ignoredFiles = parseIgnoredFileSetting(this.plugin.settings.ignoredFiles, this.app);

    if (!ignoredFiles.has(candidate.path)) {
      ignoredFiles.add(candidate.path);
      this.plugin.settings.ignoredFiles = [...ignoredFiles].sort().join("\n");
      await this.plugin.saveSettings();
    }

    this.selectedPaths.delete(candidate.path);
    new Notice("File added to VaultPrune safe list.");
    await this.refresh();
  }

  private getVisibleCandidates(summary: ScanSummary): AttachmentCandidate[] {
    const query = this.pathQuery.trim().toLowerCase();

    return summary.unusedCandidates
      .filter((candidate) => {
        if (this.extensionFilter !== "all" && candidate.extension !== this.extensionFilter) {
          return false;
        }

        if (!query) {
          return true;
        }

        const haystack = `${candidate.path} ${candidate.folder} ${candidate.extension}`.toLowerCase();
        return haystack.includes(query);
      })
      .sort((left, right) => compareCandidates(left, right, this.sortOrder));
  }

  private async trashSelected(): Promise<void> {
    const summary = this.currentSummary;
    if (!summary) {
      return;
    }

    const selectedCandidates = summary.unusedCandidates.filter((candidate) =>
      this.selectedPaths.has(candidate.path),
    );
    if (selectedCandidates.length === 0) {
      new Notice("No files selected.");
      return;
    }

    const confirmed = await new ConfirmActionModal(
      this.app,
      "Move selected attachments to trash",
      `Move ${selectedCandidates.length} selected attachment candidate(s) to trash?`,
      "Move to trash",
    ).openAndWait();
    if (!confirmed) {
      return;
    }

    let movedCount = 0;
    let failedCount = 0;

    for (const candidate of selectedCandidates) {
      try {
        await this.app.fileManager.trashFile(candidate.file);
        movedCount += 1;
      } catch (error) {
        failedCount += 1;
        console.error("VaultPrune trash failed", candidate.path, error);
      }
    }

    if (failedCount > 0) {
      new Notice(`${movedCount} file(s) moved to trash, ${failedCount} failed.`);
    } else {
      new Notice(`${movedCount} file(s) moved to trash.`);
    }

    await this.refresh();
  }
}

class AttachmentPreviewModal extends Modal {
  private candidate: AttachmentCandidate;

  constructor(app: App, candidate: AttachmentCandidate) {
    super(app);
    this.candidate = candidate;
  }

  onOpen(): void {
    this.modalEl.addClass("vaultprune-preview-modal");
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: this.candidate.path });

    const previewEl = this.contentEl.createDiv({ cls: "vaultprune-large-preview" });
    if (IMAGE_PREVIEW_EXTENSIONS.has(this.candidate.extension)) {
      const imageEl = previewEl.createEl("img", { cls: "vaultprune-large-preview-media" });
      imageEl.alt = this.candidate.path;
      imageEl.src = this.app.vault.getResourcePath(this.candidate.file);
    } else if (VIDEO_PREVIEW_EXTENSIONS.has(this.candidate.extension)) {
      const videoEl = previewEl.createEl("video", { cls: "vaultprune-large-preview-media" });
      videoEl.controls = true;
      videoEl.src = this.app.vault.getResourcePath(this.candidate.file);
    } else {
      renderPreviewBadgeContent(previewEl, this.candidate.extension);
    }

    const actionRow = this.contentEl.createDiv({ cls: "vaultprune-actions" });
    const openButtonEl = actionRow.createEl("button", { text: "Open file" });
    openButtonEl.addEventListener("click", () => {
      void this.app.workspace.getLeaf(true).openFile(this.candidate.file);
      this.close();
    });

    const closeButtonEl = actionRow.createEl("button", { text: "Close" });
    closeButtonEl.addEventListener("click", () => {
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
    this.modalEl.removeClass("vaultprune-preview-modal");
  }
}

export class VaultPruneReportModal extends Modal {
  private description: string;
  private reportText: string;
  private title: string;

  constructor(app: App, title: string, description: string, reportText: string) {
    super(app);
    this.title = title;
    this.description = description;
    this.reportText = reportText;
  }

  onOpen(): void {
    this.modalEl.addClass("vaultprune-modal");
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: this.title });
    this.contentEl.createDiv({
      cls: "vaultprune-summary",
      text: this.description,
    });

    const actionRow = this.contentEl.createDiv({ cls: "vaultprune-actions" });
    new Setting(actionRow)
      .addButton((button) => {
        button.setButtonText("Copy report").setCta().onClick(() => {
          void this.copyReport();
        });
      })
      .addButton((button) => {
        button.setButtonText("Close").onClick(() => {
          this.close();
        });
      });

    const reportEl = this.contentEl.createEl("textarea", {
      cls: "vaultprune-report-textarea",
    });
    reportEl.readOnly = true;
    reportEl.value = this.reportText;
  }

  onClose(): void {
    this.contentEl.empty();
    this.modalEl.removeClass("vaultprune-modal");
  }

  private async copyReport(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.reportText);
      new Notice("Preview report copied.");
    } catch (error) {
      console.error("VaultPrune clipboard copy failed", error);
      new Notice("Could not copy the report automatically.");
    }
  }
}

class ConfirmActionModal extends Modal {
  private ctaLabel: string;
  private message: string;
  private resolved = false;
  private resolvePromise: (value: boolean) => void;
  private title: string;

  constructor(
    app: App,
    title: string,
    message: string,
    ctaLabel: string,
  ) {
    super(app);
    this.title = title;
    this.message = message;
    this.ctaLabel = ctaLabel;
    this.resolvePromise = () => undefined;
  }

  openAndWait(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.open();
    });
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: this.title });
    this.contentEl.createEl("p", { text: this.message });

    const actionRow = this.contentEl.createDiv({ cls: "vaultprune-actions" });
    new Setting(actionRow)
      .addButton((button) => {
        button.setButtonText("Cancel").onClick(() => {
          this.finish(false);
        });
      })
      .addButton((button) => {
        button.setButtonText(this.ctaLabel).setWarning().onClick(() => {
          this.finish(true);
        });
      });
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.resolved) {
      this.resolvePromise(false);
    }
  }

  private finish(value: boolean): void {
    this.resolved = true;
    this.resolvePromise(value);
    this.close();
  }
}

function renderStat(
  parentEl: HTMLElement,
  label: string,
  value: string,
  detail: string,
): void {
  const statEl = parentEl.createDiv({ cls: "vaultprune-stat" });
  statEl.createDiv({ cls: "vaultprune-stat-value", text: value });
  statEl.createDiv({ cls: "vaultprune-stat-label", text: label });
  statEl.createDiv({ cls: "vaultprune-stat-detail", text: detail });
}

function createControlField(
  parentEl: HTMLElement,
  label: string,
  description: string,
): HTMLElement {
  const fieldEl = parentEl.createDiv({ cls: "vaultprune-control-field" });
  fieldEl.createEl("label", { cls: "vaultprune-control-label", text: label });
  fieldEl.createDiv({ cls: "vaultprune-control-description", text: description });
  return fieldEl;
}

function addSelectOption(selectEl: HTMLSelectElement, value: string, label: string): void {
  const optionEl = selectEl.createEl("option", { text: label });
  optionEl.value = value;
}

function renderPreviewBadgeContent(previewEl: HTMLElement, extension: string): void {
  previewEl.empty();
  const iconEl = previewEl.createDiv({ cls: "vaultprune-file-preview-icon" });
  setIcon(iconEl, getPreviewIcon(extension));
  previewEl.createDiv({
    cls: "vaultprune-file-preview-extension",
    text: extension || "file",
  });
}

function compareCandidates(
  left: AttachmentCandidate,
  right: AttachmentCandidate,
  sortOrder: SortOrder,
): number {
  if (sortOrder === "size-desc" && right.sizeBytes !== left.sizeBytes) {
    return right.sizeBytes - left.sizeBytes;
  }

  if (sortOrder === "modified-desc" && right.modifiedTime !== left.modifiedTime) {
    return right.modifiedTime - left.modifiedTime;
  }

  if (sortOrder === "extension") {
    const extensionCompare = left.extension.localeCompare(right.extension);
    if (extensionCompare !== 0) {
      return extensionCompare;
    }
  }

  return left.path.localeCompare(right.path);
}

function getExtensionOptions(candidates: AttachmentCandidate[]): string[] {
  return [...new Set(candidates.map((candidate) => candidate.extension))].sort();
}

function sumCandidateBytes(candidates: AttachmentCandidate[]): number {
  return candidates.reduce((total, candidate) => total + candidate.sizeBytes, 0);
}

function parseIgnoredFileSetting(value: string, app: App): Set<string> {
  return new Set(
    value
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => normalizeConfiguredFolderPath(entry, app))
      .filter(Boolean),
  );
}

function getPreviewIcon(extension: string): string {
  if (AUDIO_EXTENSIONS.has(extension)) {
    return "music";
  }

  if (ARCHIVE_EXTENSIONS.has(extension)) {
    return "archive";
  }

  if (DOCUMENT_EXTENSIONS.has(extension)) {
    return "file-text";
  }

  return "file";
}
