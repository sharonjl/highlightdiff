# Highlight Diff

VS Code/Cursor extension that background-highlights lines changed in the current branch compared to a target branch (default: `main`).

- **Green background** for added/modified lines
- **Red underline** for deleted lines
- Both appear in the overview ruler (minimap)

## Install

Download the latest `.vsix` from [Releases](https://github.com/sharonjl/highlightdiff/releases), then:

```bash
cursor --install-extension highlightdiff-0.1.0.vsix
```

Or in Cursor/VS Code: `Cmd+Shift+P` → "Extensions: Install from VSIX..."

## Build from source

```bash
git clone https://github.com/sharonjl/highlightdiff.git
cd highlightdiff
npm install
npm run compile
```

## Package and release

```bash
npx @vscode/vsce package --allow-missing-repository
gh release create v<version> highlightdiff-<version>.vsix --title "v<version>" --notes "Release notes"
```

## Commands

| Command | Description |
|---|---|
| `Highlight Diff: Toggle` | Enable/disable highlights |
| `Highlight Diff: Set Target Branch` | Change the branch to diff against |
| `Highlight Diff: Refresh` | Manually refresh highlights |

## Settings

| Setting | Default | Description |
|---|---|---|
| `highlightdiff.targetBranch` | `main` | Branch to diff against |
| `highlightdiff.addedColor` | `rgba(0, 255, 0, 0.1)` | Background color for added lines |
| `highlightdiff.deletedColor` | `rgba(255, 0, 0, 0.2)` | Indicator color for deleted lines |
| `highlightdiff.enabled` | `true` | Whether highlights are active |
