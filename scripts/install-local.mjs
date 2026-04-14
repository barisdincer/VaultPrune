import { copyFileSync, existsSync, mkdirSync } from "fs";
import { join, resolve } from "path";

const vaultPathInput = process.env.VAULT_PATH || process.argv[2];

if (!vaultPathInput) {
  console.error("Usage: node scripts/install-local.mjs /path/to/vault");
  console.error('Or run with VAULT_PATH="/path/to/vault" npm run deploy:local');
  process.exit(1);
}

const vaultPath = resolve(vaultPathInput);
const obsidianPath = join(vaultPath, ".obsidian");
const pluginPath = join(obsidianPath, "plugins", "vaultprune");
const requiredFiles = ["manifest.json", "main.js", "styles.css"];

if (!existsSync(obsidianPath)) {
  console.error(`Could not find .obsidian folder in: ${vaultPath}`);
  process.exit(1);
}

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    console.error(`Missing required file: ${file}`);
    console.error("Run npm run build before installing locally.");
    process.exit(1);
  }
}

mkdirSync(pluginPath, { recursive: true });

for (const file of requiredFiles) {
  copyFileSync(file, join(pluginPath, file));
}

console.log(`VaultPrune installed to: ${pluginPath}`);
