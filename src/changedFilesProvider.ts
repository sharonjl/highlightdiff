import * as vscode from "vscode";
import * as path from "path";
import { ChangedFileInfo } from "./types";
import { getChangedFiles } from "./gitDiff";

type TreeNode = FileItem | FolderItem;

export class ChangedFilesProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private workspaceRoot: string | undefined;
  private resolveTarget: () => Promise<string>;
  private treeView = false;

  constructor(resolveTarget: () => Promise<string>) {
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    this.resolveTarget = resolveTarget;
  }

  setTreeView(value: boolean): void {
    this.treeView = value;
    vscode.commands.executeCommand("setContext", "highlightdiff.treeView", value);
    this._onDidChangeTreeData.fire();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TreeNode): Promise<TreeNode[]> {
    if (!this.workspaceRoot) {
      return [];
    }

    if (!this.treeView) {
      // List mode — flat list, no nesting
      if (element) return [];
      const targetBranch = await this.resolveTarget();
      const files = await getChangedFiles(this.workspaceRoot, targetBranch);
      return files.map((f) => new FileItem(f, this.workspaceRoot!, true));
    }

    // Tree mode
    if (element instanceof FolderItem) {
      return element.children;
    }
    if (element instanceof FileItem) {
      return [];
    }

    // Root — build the tree
    const targetBranch = await this.resolveTarget();
    const files = await getChangedFiles(this.workspaceRoot, targetBranch);
    return buildTree(files, this.workspaceRoot);
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}

function buildTree(files: ChangedFileInfo[], workspaceRoot: string): TreeNode[] {
  const root = new Map<string, { folders: Map<string, any>; files: ChangedFileInfo[] }>();

  // Group files by directory segments
  const dirMap = new Map<string, ChangedFileInfo[]>();
  for (const file of files) {
    const dir = path.dirname(file.filePath);
    const key = dir === "." ? "" : dir;
    if (!dirMap.has(key)) dirMap.set(key, []);
    dirMap.get(key)!.push(file);
  }

  // Build folder nodes recursively
  return buildFolderNodes(dirMap, workspaceRoot);
}

function buildFolderNodes(
  dirMap: Map<string, ChangedFileInfo[]>,
  workspaceRoot: string
): TreeNode[] {
  // Collect all unique top-level segments
  const topLevel = new Map<string, { subDirs: Map<string, ChangedFileInfo[]>; files: ChangedFileInfo[] }>();

  for (const [dir, files] of dirMap) {
    if (dir === "") {
      // Root-level files
      if (!topLevel.has("")) {
        topLevel.set("", { subDirs: new Map(), files: [] });
      }
      topLevel.get("")!.files.push(...files);
      continue;
    }

    const segments = dir.split(path.sep);
    const top = segments[0];
    if (!topLevel.has(top)) {
      topLevel.set(top, { subDirs: new Map(), files: [] });
    }

    if (segments.length === 1) {
      topLevel.get(top)!.files.push(...files);
    } else {
      const rest = segments.slice(1).join(path.sep);
      topLevel.get(top)!.subDirs.set(rest, files);
    }
  }

  const nodes: TreeNode[] = [];

  // Root-level files first
  const rootEntry = topLevel.get("");
  if (rootEntry) {
    for (const f of rootEntry.files) {
      nodes.push(new FileItem(f, workspaceRoot, false));
    }
  }

  // Then folders, sorted
  const folderNames = [...topLevel.keys()].filter((k) => k !== "").sort();
  for (const folderName of folderNames) {
    const entry = topLevel.get(folderName)!;
    const children: TreeNode[] = [];

    // Recurse into subdirs
    if (entry.subDirs.size > 0) {
      children.push(...buildFolderNodes(entry.subDirs, workspaceRoot));
    }

    // Direct files in this folder
    for (const f of entry.files) {
      children.push(new FileItem(f, workspaceRoot, false));
    }

    nodes.push(new FolderItem(folderName, children));
  }

  return nodes;
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

class FileItem extends vscode.TreeItem {
  constructor(file: ChangedFileInfo, workspaceRoot: string, showDir: boolean) {
    const fileName = path.basename(file.filePath);
    super(fileName, vscode.TreeItemCollapsibleState.None);

    if (showDir) {
      const dirName = path.dirname(file.filePath);
      this.description = dirName === "." ? "" : dirName;
    }

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

class FolderItem extends vscode.TreeItem {
  public children: TreeNode[];

  constructor(folderName: string, children: TreeNode[]) {
    super(folderName, vscode.TreeItemCollapsibleState.Expanded);
    this.children = children;
    this.iconPath = vscode.ThemeIcon.Folder;
    this.contextValue = "folder";
  }
}
