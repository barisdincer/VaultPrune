import { App, Modal, Notice, Setting } from "obsidian";
import type VaultPrunePlugin from "./main";
import type { AttachmentCandidate, ScanSummary } from "./scanner";
import { formatBytes, formatTimestamp } from "./utils";

type SortOrder = "extension" | "modified-desc" | "path" | "size-desc";

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
    this.contentEl.createEl("h2", { text: "VaultPrune review" });
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
      this.contentEl.createEl("h2", { text: "VaultPrune review" });
      this.contentEl.createDiv({
        cls: "vaultprune-empty",
        text: "VaultPrune could not complete the scan. Check the developer console for details.",
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
    contentEl.createEl("h2", { text: "VaultPrune review" });
    contentEl.createDiv({
      cls: "vaultprune-summary",
      text:
        `${summary.scannedMarkdownFiles} Markdown note(s), ` +
        `${summary.scannedCanvasFiles} Canvas file(s), ` +
        `${summary.scannedExtraReferenceFiles} extra reference file(s), ` +
        `${summary.scannedAttachmentFiles} attachment candidate(s) scanned. ` +
        `${summary.referencedAttachmentCount} referenced attachment(s) matched. ` +
        `${summary.unusedCandidates.length} unused candidate(s) found ` +
        `(${formatBytes(summary.unusedBytes)}).`,
    });
    contentEl.createDiv({
      cls: "vaultprune-summary vaultprune-summary-secondary",
      text:
        `Visible: ${visibleCandidates.length} (${formatBytes(visibleBytes)})` +
        `  |  Selected in view: ${selectedVisibleCandidates.length} (${formatBytes(selectedVisibleBytes)})` +
        `  |  Selected overall: ${selectedAllCandidates.length}`,
    });

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

    const listEl = contentEl.createDiv({ cls: "vaultprune-file-list" });
    for (const candidate of visibleCandidates) {
      this.renderCandidateRow(listEl, summary, candidate);
    }
  }

  private renderControls(
    parentEl: HTMLElement,
    summary: ScanSummary,
    visibleCandidates: AttachmentCandidate[],
  ): void {
    const toolbarEl = parentEl.createDiv({ cls: "vaultprune-toolbar" });
    const extensionOptions = getExtensionOptions(summary.unusedCandidates);

    new Setting(toolbarEl)
      .setName("Search")
      .setDesc("Filter by path, folder, or extension.")
      .addText((text) => {
        text.setPlaceholder("attachments/logo")
          .setValue(this.pathQuery)
          .onChange((value) => {
            this.pathQuery = value;
            this.render(summary);
          });
        text.inputEl.classList.add("vaultprune-search-input");
      });

    new Setting(toolbarEl)
      .setName("Extension")
      .setDesc("Only show candidates matching one extension.")
      .addDropdown((dropdown) => {
        dropdown.addOption("all", "All extensions");
        for (const option of extensionOptions) {
          dropdown.addOption(option, `.${option}`);
        }

        dropdown.setValue(this.extensionFilter).onChange((value) => {
          this.extensionFilter = value;
          this.render(summary);
        });
      });

    new Setting(toolbarEl)
      .setName("Sort")
      .setDesc("Change candidate ordering.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("path", "Path")
          .addOption("size-desc", "Largest first")
          .addOption("modified-desc", "Recently modified")
          .addOption("extension", "Extension")
          .setValue(this.sortOrder)
          .onChange((value) => {
            this.sortOrder = value as SortOrder;
            this.render(summary);
          });
      });

    const actionRow = parentEl.createDiv({ cls: "vaultprune-actions" });
    new Setting(actionRow)
      .addButton((button) => {
        button.setButtonText("Refresh").setIcon("rotate-ccw").onClick(() => {
          void this.refresh();
        });
      })
      .addButton((button) => {
        button.setButtonText("Reset filters").onClick(() => {
          this.pathQuery = "";
          this.extensionFilter = "all";
          this.sortOrder = "path";
          this.render(summary);
        });
      })
      .addButton((button) => {
        button.setButtonText("Select visible").onClick(() => {
          for (const candidate of visibleCandidates) {
            this.selectedPaths.add(candidate.path);
          }
          this.render(summary);
        });
      })
      .addButton((button) => {
        button.setButtonText("Clear visible").onClick(() => {
          for (const candidate of visibleCandidates) {
            this.selectedPaths.delete(candidate.path);
          }
          this.render(summary);
        });
      })
      .addButton((button) => {
        button.setButtonText("Preview report").setCta().onClick(() => {
          this.plugin.openPreviewReport(
            summary,
            visibleCandidates,
            this.selectedPaths,
            "VaultPrune preview report",
            "Preview only. This report reflects the current filtered view.",
          );
        });
      })
      .addButton((button) => {
        button
          .setButtonText("Move selected to trash")
          .setWarning()
          .setDisabled(this.selectedPaths.size === 0)
          .onClick(() => {
            void this.trashSelected();
          });
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

    const detailsEl = rowEl.createDiv({ cls: "vaultprune-file-details" });
    detailsEl.createDiv({
      cls: "vaultprune-file-path",
      text: candidate.path,
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

    const openButton = rowEl.createEl("button", {
      cls: "vaultprune-open-button",
      text: "Open",
    });
    openButton.addEventListener("click", () => {
      void this.app.workspace.getLeaf(true).openFile(candidate.file);
    });
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

    const confirmed = window.confirm(
      `Move ${selectedCandidates.length} selected attachment candidate(s) to trash?`,
    );
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
      new Notice("VaultPrune preview report copied.");
    } catch (error) {
      console.error("VaultPrune clipboard copy failed", error);
      new Notice("VaultPrune could not copy the report automatically.");
    }
  }
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
