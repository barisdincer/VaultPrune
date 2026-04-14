import { Notice, Plugin } from "obsidian";
import { buildPreviewReport } from "./report";
import {
  scanVault,
  type AttachmentCandidate,
  type ScanSummary,
} from "./scanner";
import { VaultPruneReviewModal, VaultPruneReportModal } from "./review-modal";
import {
  buildDefaultSettings,
  VaultPruneSettingTab,
  type VaultPruneSettings,
} from "./settings";

export default class VaultPrunePlugin extends Plugin {
  settings!: VaultPruneSettings;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addCommand({
      id: "scan-unused-attachments",
      name: "Scan unused attachments",
      callback: () => {
        new VaultPruneReviewModal(this.app, this).open();
      },
    });

    this.addCommand({
      id: "preview-unused-attachments-report",
      name: "Preview unused attachments report",
      callback: async () => {
        try {
          const summary = await this.createScanSummary();
          this.openPreviewReport(
            summary,
            summary.unusedCandidates,
            new Set(summary.unusedCandidates.map((candidate) => candidate.path)),
            "Preview unused attachments report",
            "Preview only. No files were moved or deleted.",
          );
        } catch (error) {
          console.error("VaultPrune preview report failed", error);
          new Notice("Could not generate the preview report.");
        }
      },
    });

    this.addSettingTab(new VaultPruneSettingTab(this.app, this));
  }

  async loadSettings(): Promise<void> {
    const loaded = (await this.loadData()) as Partial<VaultPruneSettings> | null;
    this.settings = Object.assign({}, buildDefaultSettings(this.app.vault.configDir), loaded ?? {});
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async createScanSummary(): Promise<ScanSummary> {
    return scanVault(this.app, this.settings);
  }

  openPreviewReport(
    summary: ScanSummary,
    candidates: AttachmentCandidate[],
    selectedPaths: Set<string>,
    title: string,
    description: string,
  ): void {
    const reportText = buildPreviewReport({
      summary,
      candidates,
      selectedPaths,
      title,
      description,
    });

    new VaultPruneReportModal(this.app, title, description, reportText).open();
  }
}
