import * as vscode from "vscode";
import * as path from "path";
import { DecorationManager } from "./decorationManager";
import { BlameManager } from "./blameManager";
import { ChangedFilesProvider } from "./changedFilesProvider";
import { getChangedLines, listBranches, detectTargetBranch } from "./gitDiff";

let decorationManager: DecorationManager;
let blameManager: BlameManager;
let changedFilesProvider: ChangedFilesProvider;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let enabled = true;
let resolvedTargetBranch: string | undefined;

function getConfig() {
  return vscode.workspace.getConfiguration("highlightdiff");
}

async function resolveTargetBranch(workspaceRoot: string): Promise<string> {
  const configured = getConfig().get<string>("targetBranch", "auto");
  if (configured !== "auto") {
    return configured;
  }
  if (!resolvedTargetBranch) {
    resolvedTargetBranch = await detectTargetBranch(workspaceRoot);
  }
  return resolvedTargetBranch;
}

async function updateDecorations(editor: vscode.TextEditor): Promise<void> {
  if (!enabled) {
    decorationManager.clearDecorations(editor);
    return;
  }

  if (editor.document.uri.scheme !== "file") {
    return;
  }

  // Skip diff editors — VS Code's built-in diff view already highlights changes
  const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
  if (tab?.input instanceof vscode.TabInputTextDiff) {
    return;
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
  if (!workspaceFolder) {
    return;
  }

  const targetBranch = await resolveTargetBranch(workspaceFolder.uri.fsPath);
  const filePath = path.relative(workspaceFolder.uri.fsPath, editor.document.uri.fsPath);

  const diffs = await getChangedLines(workspaceFolder.uri.fsPath, filePath, targetBranch);
  decorationManager.applyDecorations(editor, diffs);
}

function updateAllVisibleEditors(): void {
  for (const editor of vscode.window.visibleTextEditors) {
    updateDecorations(editor);
  }
  changedFilesProvider?.refresh();
}

function debouncedUpdateAll(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(updateAllVisibleEditors, 300);
}

export function activate(context: vscode.ExtensionContext): void {
  decorationManager = new DecorationManager();
  blameManager = new BlameManager();
  blameManager.start(context);
  enabled = getConfig().get<boolean>("enabled", true);

  // Changed files tree view in Source Control
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  changedFilesProvider = new ChangedFilesProvider(async () => {
    if (!workspaceRoot) return "main";
    return resolveTargetBranch(workspaceRoot);
  });
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("highlightdiff.changedFiles", changedFilesProvider)
  );
  context.subscriptions.push({ dispose: () => changedFilesProvider.dispose() });

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

  // Watch .git/HEAD for branch switches — invalidate cached target
  const gitHeadWatcher = vscode.workspace.createFileSystemWatcher("**/.git/HEAD");
  gitHeadWatcher.onDidChange(() => {
    resolvedTargetBranch = undefined;
    debouncedUpdateAll();
  });
  context.subscriptions.push(gitHeadWatcher);

  // React to config changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("highlightdiff")) {
        enabled = getConfig().get<boolean>("enabled", true);
        resolvedTargetBranch = undefined;
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

      // Find workspace root for branch listing
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      const branches = workspaceFolder
        ? await listBranches(workspaceFolder.uri.fsPath)
        : [];

      let value: string | undefined;
      if (branches.length > 0) {
        const items = branches.map((b) => ({
          label: b,
          description: b === current ? "(current target)" : undefined,
        }));
        const picked = await vscode.window.showQuickPick(items, {
          placeHolder: `Current target: ${current}`,
          matchOnDescription: true,
        });
        value = picked?.label;
      } else {
        value = await vscode.window.showInputBox({
          prompt: "Target branch to diff against",
          value: current,
        });
      }

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

  context.subscriptions.push(
    vscode.commands.registerCommand("highlightdiff.viewAsTree", () => {
      changedFilesProvider.setTreeView(true);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("highlightdiff.viewAsList", () => {
      changedFilesProvider.setTreeView(false);
    })
  );

  context.subscriptions.push({ dispose: () => decorationManager.dispose() });
  context.subscriptions.push({ dispose: () => blameManager.dispose() });

  // Initial decoration pass
  if (vscode.window.activeTextEditor) {
    updateDecorations(vscode.window.activeTextEditor);
  }
}

export function deactivate(): void {}
