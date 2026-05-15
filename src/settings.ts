import { App, PluginSettingTab, Setting } from "obsidian";
import type VaultPrunePlugin from "./main";
import { VaultPruneReviewModal } from "./review-modal";
import { normalizeConfiguredFolderPath } from "./utils";

type SettingsTextareaSize = "medium" | "short" | "tall";

export interface VaultPruneSettings {
  attachmentFolders: string;
  ignoredFolders: string;
  ignoredFiles: string;
  attachmentExtensions: string;
  extraReferenceExtensions: string;
}

export const DEFAULT_ATTACHMENT_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "ico",
  "avif",
  "heic",
  "pdf",
  "epub",
  "mp3",
  "wav",
  "ogg",
  "m4a",
  "flac",
  "mp4",
  "mov",
  "webm",
  "mkv",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "zip",
  "7z",
  "rar"
].join(", ");

export function buildDefaultSettings(configDir: string): VaultPruneSettings {
  return {
    attachmentFolders: "",
    ignoredFolders: [configDir, ".trash", ".git"].filter(Boolean).join("\n"),
    ignoredFiles: "",
    attachmentExtensions: DEFAULT_ATTACHMENT_EXTENSIONS,
    extraReferenceExtensions: "json",
  };
}

function normalizeMultilinePaths(value: string, app: App): string {
  return value
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => normalizeConfiguredFolderPath(entry, app))
    .filter(Boolean)
    .join("\n");
}

function normalizeExtensions(value: string): string {
  return value
    .split(/[,\n]/)
    .map((entry) => entry.trim().replace(/^\./, "").toLowerCase())
    .filter(Boolean)
    .join(", ");
}

function applySettingsTextareaLayout(
  textareaEl: HTMLTextAreaElement,
  size: SettingsTextareaSize,
): void {
  const heightBySize: Record<SettingsTextareaSize, string> = {
    medium: "4rem",
    short: "2.75rem",
    tall: "4.75rem",
  };
  const height = heightBySize[size];

  textareaEl.classList.add("vaultprune-settings-textarea");
  textareaEl.style.height = height;
  textareaEl.style.minHeight = height;
  textareaEl.style.maxHeight = "10rem";
  textareaEl.style.overflowY = "auto";
}

export class VaultPruneSettingTab extends PluginSettingTab {
  plugin: VaultPrunePlugin;

  constructor(app: App, plugin: VaultPrunePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("vaultprune-settings-tab");
    this.normalizeStoredPathSettings();

    const scanSetting = new Setting(containerEl)
      .setName("Find unused attachments")
      .setDesc(
        "Scan attachment folders and review files that are not referenced by notes, Canvas files, or configured extra reference files.",
      )
      .addButton((button) => {
        button
          .setButtonText("Scan now")
          .setIcon("search")
          .setCta()
          .onClick(() => {
            new VaultPruneReviewModal(this.app, this.plugin).open();
          });
      });
    scanSetting.settingEl.addClass("vaultprune-settings-action");

    const attachmentFoldersSetting = new Setting(containerEl)
      .setName("Attachment folders")
      .setDesc("Optional. One folder per line. Leave empty to scan the whole vault.")
      .addTextArea((text) => {
        text
          .setPlaceholder("z_ekler\nAttachments\nassets/images")
          .setValue(this.plugin.settings.attachmentFolders)
          .onChange(async (value) => {
            this.plugin.settings.attachmentFolders = normalizeMultilinePaths(value, this.app);
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 2;
        text.inputEl.cols = 40;
        applySettingsTextareaLayout(text.inputEl, "short");
      });
    attachmentFoldersSetting.settingEl.addClass("vaultprune-settings-textarea-setting");

    const ignoredFoldersSetting = new Setting(containerEl)
      .setName("Ignored folders")
      .setDesc("One folder per line. These folders will be skipped during candidate selection.")
      .addTextArea((text) => {
        text
          .setPlaceholder(`${this.app.vault.configDir}\n.trash`)
          .setValue(this.plugin.settings.ignoredFolders)
          .onChange(async (value) => {
            this.plugin.settings.ignoredFolders = normalizeMultilinePaths(value, this.app);
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 3;
        text.inputEl.cols = 40;
        applySettingsTextareaLayout(text.inputEl, "medium");
      });
    ignoredFoldersSetting.settingEl.addClass("vaultprune-settings-textarea-setting");

    const ignoredFilesSetting = new Setting(containerEl)
      .setName("Safe-listed files")
      .setDesc("One file per line. These files will be ignored by unused attachment scans.")
      .addTextArea((text) => {
        text
          .setPlaceholder("z_ekler/keep-this.png")
          .setValue(this.plugin.settings.ignoredFiles)
          .onChange(async (value) => {
            this.plugin.settings.ignoredFiles = normalizeMultilinePaths(value, this.app);
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 3;
        text.inputEl.cols = 40;
        applySettingsTextareaLayout(text.inputEl, "medium");
      });
    ignoredFilesSetting.settingEl.addClass("vaultprune-settings-textarea-setting");

    const attachmentExtensionsSetting = new Setting(containerEl)
      .setName("Attachment extensions")
      .setDesc("Comma or newline separated list of file extensions considered as attachment candidates.")
      .addTextArea((text) => {
        text
          .setPlaceholder(DEFAULT_ATTACHMENT_EXTENSIONS)
          .setValue(this.plugin.settings.attachmentExtensions)
          .onChange(async (value) => {
            this.plugin.settings.attachmentExtensions = normalizeExtensions(value);
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 4;
        text.inputEl.cols = 40;
        applySettingsTextareaLayout(text.inputEl, "tall");
        text.inputEl.classList.add("vaultprune-settings-textarea-tall");
      });
    attachmentExtensionsSetting.settingEl.addClass("vaultprune-settings-textarea-setting");

    const extraReferenceExtensionsSetting = new Setting(containerEl)
      .setName("Extra reference file extensions")
      .setDesc("Optionally scan text-based file extensions for extra attachment references, such as JSON or CSV.")
      .addTextArea((text) => {
        text
          .setPlaceholder("JSON, CSV")
          .setValue(this.plugin.settings.extraReferenceExtensions)
          .onChange(async (value) => {
            this.plugin.settings.extraReferenceExtensions = normalizeExtensions(value);
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 2;
        text.inputEl.cols = 40;
        applySettingsTextareaLayout(text.inputEl, "short");
        text.inputEl.classList.add("vaultprune-settings-textarea-short");
      });
    extraReferenceExtensionsSetting.settingEl.addClass("vaultprune-settings-textarea-setting");
  }

  private normalizeStoredPathSettings(): void {
    let changed = false;
    const attachmentFolders = normalizeMultilinePaths(
      this.plugin.settings.attachmentFolders,
      this.app,
    );
    const ignoredFolders = normalizeMultilinePaths(this.plugin.settings.ignoredFolders, this.app);
    const ignoredFiles = normalizeMultilinePaths(this.plugin.settings.ignoredFiles, this.app);

    if (attachmentFolders !== this.plugin.settings.attachmentFolders) {
      this.plugin.settings.attachmentFolders = attachmentFolders;
      changed = true;
    }

    if (ignoredFolders !== this.plugin.settings.ignoredFolders) {
      this.plugin.settings.ignoredFolders = ignoredFolders;
      changed = true;
    }

    if (ignoredFiles !== this.plugin.settings.ignoredFiles) {
      this.plugin.settings.ignoredFiles = ignoredFiles;
      changed = true;
    }

    if (changed) {
      void this.plugin.saveSettings();
    }
  }
}
