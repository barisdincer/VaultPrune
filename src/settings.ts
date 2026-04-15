import { App, PluginSettingTab, Setting, normalizePath } from "obsidian";
import type VaultPrunePlugin from "./main";

export interface VaultPruneSettings {
  attachmentFolders: string;
  ignoredFolders: string;
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
    attachmentExtensions: DEFAULT_ATTACHMENT_EXTENSIONS,
    extraReferenceExtensions: "json",
  };
}

function normalizeMultilinePaths(value: string): string {
  return value
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => normalizePath(entry).replace(/\/$/, ""))
    .join("\n");
}

function normalizeExtensions(value: string): string {
  return value
    .split(/[,\n]/)
    .map((entry) => entry.trim().replace(/^\./, "").toLowerCase())
    .filter(Boolean)
    .join(", ");
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

    new Setting(containerEl)
      .setName("Attachment folders")
      .setDesc("Optional. One folder per line. Leave empty to scan the whole vault.")
      .addTextArea((text) => {
        text
          .setPlaceholder("Attachments\nAssets/images")
          .setValue(this.plugin.settings.attachmentFolders)
          .onChange(async (value) => {
            this.plugin.settings.attachmentFolders = normalizeMultilinePaths(value);
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 4;
        text.inputEl.cols = 40;
      });

    new Setting(containerEl)
      .setName("Ignored folders")
      .setDesc("One folder per line. These folders will be skipped during candidate selection.")
      .addTextArea((text) => {
        text
          .setPlaceholder(`${this.app.vault.configDir}\n.trash`)
          .setValue(this.plugin.settings.ignoredFolders)
          .onChange(async (value) => {
            this.plugin.settings.ignoredFolders = normalizeMultilinePaths(value);
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 4;
        text.inputEl.cols = 40;
      });

    new Setting(containerEl)
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
      });

    new Setting(containerEl)
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
        text.inputEl.rows = 3;
        text.inputEl.cols = 40;
      });
  }
}
