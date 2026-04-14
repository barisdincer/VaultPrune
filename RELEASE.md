# Release Guide

VaultPrune release assets should contain:

- `manifest.json`
- `main.js`
- `styles.css`

## Prepare a release

1. Update the version in `package.json`.
2. Run:

   ```bash
   npm run version
   npm run build
   ```

3. Verify:

- `manifest.json` version matches `package.json`
- `versions.json` contains the new version
- `main.js` was rebuilt successfully

For local vault testing you can also run:

```bash
VAULT_PATH="/absolute/path/to/your/vault" npm run deploy:local
```

## Publish a GitHub release

1. Create a new Git tag for the plugin version.
2. Create a GitHub release using the same version number.
3. Upload:

- `manifest.json`
- `main.js`
- `styles.css`

## Community plugin submission

After the plugin is stable:

1. Make sure the repository is public.
2. Confirm the release assets are available on GitHub.
3. Submit the plugin according to Obsidian's community plugin submission process.
