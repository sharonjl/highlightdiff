import * as vscode from "vscode";
import * as path from "path";
import { DecorationManager } from "./decorationManager";
import { getChangedLines } from "./gitDiff";

let decorationManager: DecorationManager;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let enabled = true;

function getConfig() {
  return vscode.workspace.getConfiguration("highlightdiff");
}

async function updateDecorations(editor: vscode.TextEditor): Promise<void> {
  if (!enabled) {
    decorationManager.clearDecorations(editor);
    return;
  }

  if (editor.document.uri.scheme !== "file") {
    return;
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
  if (!workspaceFolder) {
    return;
  }

  const targetBranch = getConfig().get<string>("targetBranch", "main");
  const filePath = path.relative(workspaceFolder.uri.fsPath, editor.document.uri.fsPath);

  const diffs = await getChangedLines(workspaceFolder.uri.fsPath, filePath, targetBranch);
  decorationManager.applyDecorations(editor, diffs);
}

function updateAllVisibleEditors(): void {
  for (const editor of vscode.window.visibleTextEditors) {
    updateDecorations(editor);
  }
}

function debouncedUpdateAll(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(updateAllVisibleEditors, 300);
}

export function activate(context: vscode.ExtensionContext): void {
  decorationManager = new DecorationManager();
  enabled = getConfig().get<boolean>("enabled", true);

  // Update on active editor change
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        updateDecorations(editor);
      }
    })
  );

  // Update on visible editors change (split views)
  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors(() => {
      debouncedUpdateAll();
    })
  );

  // Update on file save
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(() => {
      debouncedUpdateAll();
    })
  );

  // Watch .git/HEAD for branch switches
  const gitHeadWatcher = vscode.workspace.createFileSystemWatcher("**/.git/HEAD");
  gitHeadWatcher.onDidChange(() => debouncedUpdateAll());
  context.subscriptions.push(gitHeadWatcher);

  // React to config changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("highlightdiff")) {
        enabled = getConfig().get<boolean>("enabled", true);
        decorationManager.refreshColors();
        if (enabled) {
          updateAllVisibleEditors();
        } else {
          for (const editor of vscode.window.visibleTextEditors) {
            decorationManager.clearDecorations(editor);
          }
        }
      }
    })
  );

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("highlightdiff.toggle", () => {
      const config = getConfig();
      const current = config.get<boolean>("enabled", true);
      config.update("enabled", !current, vscode.ConfigurationTarget.Workspace);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("highlightdiff.setTargetBranch", async () => {
      const config = getConfig();
      const current = config.get<string>("targetBranch", "main");
      const value = await vscode.window.showInputBox({
        prompt: "Target branch to diff against",
        value: current,
      });
      if (value !== undefined) {
        await config.update("targetBranch", value, vscode.ConfigurationTarget.Workspace);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("highlightdiff.refresh", () => {
      updateAllVisibleEditors();
    })
  );

  context.subscriptions.push({ dispose: () => decorationManager.dispose() });

  // Initial decoration pass
  if (vscode.window.activeTextEditor) {
    updateDecorations(vscode.window.activeTextEditor);
  }
}

export function deactivate(): void {}
