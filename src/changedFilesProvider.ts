import * as vscode from "vscode";
import * as path from "path";
import { ChangedFileInfo } from "./types";
import { getChangedFiles, detectTargetBranch } from "./gitDiff";

export class ChangedFilesProvider implements vscode.TreeDataProvider<ChangedFileItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private workspaceRoot: string | undefined;
  private resolveTarget: () => Promise<string>;

  constructor(resolveTarget: () => Promise<string>) {
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    this.resolveTarget = resolveTarget;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ChangedFileItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<ChangedFileItem[]> {
    if (!this.workspaceRoot) {
      return [];
    }

    const targetBranch = await this.resolveTarget();
    const files = await getChangedFiles(this.workspaceRoot, targetBranch);

    return files.map((f) => new ChangedFileItem(f, this.workspaceRoot!));
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}

const statusLabels: Record<string, string> = {
  A: "Added",
  M: "Modified",
  D: "Deleted",
  R: "Renamed",
};

const statusIcons: Record<string, vscode.ThemeIcon> = {
  A: new vscode.ThemeIcon("diff-added", new vscode.ThemeColor("gitDecoration.addedResourceForeground")),
  M: new vscode.ThemeIcon("diff-modified", new vscode.ThemeColor("gitDecoration.modifiedResourceForeground")),
  D: new vscode.ThemeIcon("diff-removed", new vscode.ThemeColor("gitDecoration.deletedResourceForeground")),
  R: new vscode.ThemeIcon("diff-renamed", new vscode.ThemeColor("gitDecoration.renamedResourceForeground")),
};

class ChangedFileItem extends vscode.TreeItem {
  constructor(file: ChangedFileInfo, workspaceRoot: string) {
    const fileName = path.basename(file.filePath);
    const dirName = path.dirname(file.filePath);

    super(fileName, vscode.TreeItemCollapsibleState.None);

    this.description = dirName === "." ? "" : dirName;
    this.tooltip = `${statusLabels[file.status] ?? file.status}: ${file.filePath}`;
    this.iconPath = statusIcons[file.status] ?? new vscode.ThemeIcon("file");

    if (file.status !== "D") {
      const fileUri = vscode.Uri.file(path.join(workspaceRoot, file.filePath));
      this.command = {
        command: "vscode.open",
        title: "Open File",
        arguments: [fileUri],
      };
      this.resourceUri = fileUri;
    }
  }
}
