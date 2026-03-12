import * as vscode from "vscode";
import { LineDiff, ChangeType } from "./types";

export class DecorationManager {
  private addedDecoration: vscode.TextEditorDecorationType;
  private deletedDecoration: vscode.TextEditorDecorationType;

  constructor() {
    const config = vscode.workspace.getConfiguration("highlightdiff");
    this.addedDecoration = this.createAddedDecoration(config);
    this.deletedDecoration = this.createDeletedDecoration(config);
  }

  private createAddedDecoration(
    config: vscode.WorkspaceConfiguration
  ): vscode.TextEditorDecorationType {
    return vscode.window.createTextEditorDecorationType({
      backgroundColor: config.get<string>("addedColor", "rgba(0, 255, 0, 0.1)"),
      isWholeLine: true,
      overviewRulerColor: "rgba(0, 200, 0, 0.6)",
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });
  }

  private createDeletedDecoration(
    config: vscode.WorkspaceConfiguration
  ): vscode.TextEditorDecorationType {
    const color = config.get<string>("deletedColor", "rgba(255, 0, 0, 0.2)");
    return vscode.window.createTextEditorDecorationType({
      borderWidth: "0 0 2px 0",
      borderStyle: "solid",
      borderColor: color,
      isWholeLine: true,
      overviewRulerColor: "rgba(200, 0, 0, 0.6)",
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });
  }

  applyDecorations(editor: vscode.TextEditor, diffs: LineDiff[]): void {
    const addedRanges: vscode.DecorationOptions[] = [];
    const deletedRanges: vscode.DecorationOptions[] = [];

    for (const diff of diffs) {
      const line = Math.min(diff.lineNumber, editor.document.lineCount - 1);
      const range = new vscode.Range(line, 0, line, 0);
      const hoverMessage = this.buildHoverMessage(diff);

      if (diff.changeType === ChangeType.Added) {
        addedRanges.push({ range, hoverMessage });
      } else {
        deletedRanges.push({ range, hoverMessage });
      }
    }

    editor.setDecorations(this.addedDecoration, addedRanges);
    editor.setDecorations(this.deletedDecoration, deletedRanges);
  }

  private buildHoverMessage(diff: LineDiff): vscode.MarkdownString | undefined {
    if (!diff.oldLines || diff.oldLines.length === 0) {
      if (diff.changeType === ChangeType.Added) {
        return new vscode.MarkdownString("**Added** — new line");
      }
      return undefined;
    }

    const escaped = diff.oldLines
      .map((l) => l.replace(/\\/g, "\\\\").replace(/`/g, "\\`"))
      .join("\n");

    const label =
      diff.changeType === ChangeType.Deleted ? "**Deleted:**" : "**Previous:**";

    const md = new vscode.MarkdownString(
      `${label}\n\`\`\`\n${escaped}\n\`\`\``
    );
    md.isTrusted = true;
    return md;
  }

  clearDecorations(editor: vscode.TextEditor): void {
    editor.setDecorations(this.addedDecoration, []);
    editor.setDecorations(this.deletedDecoration, []);
  }

  refreshColors(): void {
    this.addedDecoration.dispose();
    this.deletedDecoration.dispose();
    const config = vscode.workspace.getConfiguration("highlightdiff");
    this.addedDecoration = this.createAddedDecoration(config);
    this.deletedDecoration = this.createDeletedDecoration(config);
  }

  dispose(): void {
    this.addedDecoration.dispose();
    this.deletedDecoration.dispose();
  }
}
