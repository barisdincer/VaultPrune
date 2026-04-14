# VaultPrune - Unused Attachment Cleaner

VaultPrune is an Obsidian plugin that helps you find attachments that are no longer referenced inside your vault.

Current repository: https://github.com/barisdincer/VaultPrune

The original project started as a Python prototype. Since Obsidian community plugins run on TypeScript/JavaScript, this repository is now being reshaped into a native Obsidian plugin.

## Current direction

The plugin-first approach is a better fit for this project because:

- the plugin can work directly against the currently opened vault
- users do not need to type the vault path manually
- review and cleanup can happen inside Obsidian
- deleting files can respect Obsidian's trash behavior
- the initial community release can stay desktop-focused for safer rollout

## Planned behavior

VaultPrune is being designed around a safe cleanup flow:

1. Scan the vault for likely attachment files.
2. Detect which attachments are referenced by Markdown notes.
3. Also consider file references inside Canvas files, including text-card links and group backgrounds.
4. Show unused attachment candidates in a review modal with search, extension filters, sorting, and bulk selection tools.
5. Generate a preview-only report before moving reviewed files to trash.
6. Let the user move selected files to trash.

## Repository status

This repository now contains the initial Obsidian plugin scaffold:

- `manifest.json`
- `package.json`
- `tsconfig.json`
- `esbuild.config.mjs`
- `src/`

The legacy Python script is still present as an early prototype/reference, but it is not part of the plugin runtime.

## Local development

You need Node.js and npm on your machine to build the plugin.

```bash
npm install
npm run dev
```

To test the plugin manually, copy the built plugin files into:

```text
<your-vault>/.obsidian/plugins/vaultprune/
```

Expected plugin files:

- `manifest.json`
- `main.js`
- `styles.css`

For one-command local deployment into a vault:

```bash
VAULT_PATH="/absolute/path/to/your/vault" npm run deploy:local
```

Or after a build:

```bash
node scripts/install-local.mjs "/absolute/path/to/your/vault"
```

## First milestone

The first plugin milestone focuses on:

- scanning the vault safely
- listing unused attachment candidates
- reviewing them in a modal
- filtering and preview-reporting candidates before deletion
- moving selected files to trash

## Current commands

- `VaultPrune: Scan unused attachments`
- `VaultPrune: Preview unused attachments report`

## Release preparation

This repository includes release helpers:

- `version-bump.mjs`
- `versions.json`
- [RELEASE.md](RELEASE.md)

Suggested release flow:

```bash
npm run version
npm run build
```

## Manual install in Obsidian

1. Build the plugin.
2. Copy `manifest.json`, `main.js`, and `styles.css` into:

```text
<your-vault>/.obsidian/plugins/vaultprune/
```

3. In Obsidian, open `Settings -> Community plugins`.
4. If needed, disable `Restricted mode`.
5. Enable `VaultPrune - Unused Attachment Cleaner`.

## Platform support

The current release target is desktop only. This keeps the first community submission conservative while the plugin behavior is validated on real vaults.

## Notes

- The current scan logic is intentionally conservative.
- Users should still review candidates before trashing them.
- More advanced detection can be added later for plugin-specific file references and edge cases.

## Security and disclosures

- VaultPrune scans files inside the currently opened Obsidian vault to detect attachment references.
- VaultPrune can move selected vault files to trash when the user explicitly confirms the action.
- VaultPrune does not require an account.
- VaultPrune does not send telemetry.
- VaultPrune does not display ads.
- VaultPrune does not intentionally access files outside the active vault during normal plugin operation.
- VaultPrune does not require a paid service.
