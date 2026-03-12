import * as vscode from "vscode";
import { LineDiff, ChangeType } from "./types";

type DecorationStyle = "background" | "gutter" | "border" | "overview-ruler";

export class DecorationManager {
  private addedDecoration: vscode.TextEditorDecorationType;
  private deletedDecoration: vscode.TextEditorDecorationType;

  constructor() {
    const config = vscode.workspace.getConfiguration("highlightdiff");
    const style = config.get<DecorationStyle>("decorationStyle", "background");
    const addedColor = config.get<string>("addedColor", "rgba(0, 255, 0, 0.1)");
    const deletedColor = config.get<string>("deletedColor", "rgba(255, 0, 0, 0.2)");
    this.addedDecoration = this.createDecoration(style, addedColor, "added");
    this.deletedDecoration = this.createDecoration(style, deletedColor, "deleted");
  }

  private createDecoration(
    style: DecorationStyle,
    color: string,
    kind: "added" | "deleted"
  ): vscode.TextEditorDecorationType {
    const rulerColor = kind === "added" ? "rgba(0, 200, 0, 0.6)" : "rgba(200, 0, 0, 0.6)";

    switch (style) {
      case "background":
        if (kind === "deleted") {
          return vscode.window.createTextEditorDecorationType({
            borderWidth: "0 0 2px 0",
            borderStyle: "solid",
            borderColor: color,
            isWholeLine: true,
            overviewRulerColor: rulerColor,
            overviewRulerLane: vscode.OverviewRulerLane.Left,
          });
        }
        return vscode.window.createTextEditorDecorationType({
          backgroundColor: color,
          isWholeLine: true,
          overviewRulerColor: rulerColor,
          overviewRulerLane: vscode.OverviewRulerLane.Left,
        });

      case "gutter":
        return vscode.window.createTextEditorDecorationType({
          gutterIconPath: undefined,
          gutterIconSize: "contain",
          borderWidth: "0 0 0 3px",
          borderStyle: "solid",
          borderColor: color,
          overviewRulerColor: rulerColor,
          overviewRulerLane: vscode.OverviewRulerLane.Left,
        });

      case "border":
        return vscode.window.createTextEditorDecorationType({
          borderWidth: kind === "deleted" ? "0 0 2px 0" : "1px",
          borderStyle: kind === "deleted" ? "dashed" : "solid",
          borderColor: color,
          isWholeLine: true,
          overviewRulerColor: rulerColor,
          overviewRulerLane: vscode.OverviewRulerLane.Left,
        });

      case "overview-ruler":
        return vscode.window.createTextEditorDecorationType({
          overviewRulerColor: rulerColor,
          overviewRulerLane: vscode.OverviewRulerLane.Left,
        });
    }
  }

  applyDecorations(editor: vscode.TextEditor, diffs: LineDiff[]): void {
    const addedRanges: vscode.DecorationOptions[] = [];
    const deletedRanges: vscode.DecorationOptions[] = [];

    for (const diff of diffs) {
      const line = Math.min(diff.lineNumber, editor.document.lineCount - 1);
      const range = new vscode.Range(line, 0, line, 0);

      if (diff.changeType === ChangeType.Added) {
        addedRanges.push({ range });
      } else {
        deletedRanges.push({ range });
      }
    }

    editor.setDecorations(this.addedDecoration, addedRanges);
    editor.setDecorations(this.deletedDecoration, deletedRanges);
  }

  clearDecorations(editor: vscode.TextEditor): void {
    editor.setDecorations(this.addedDecoration, []);
    editor.setDecorations(this.deletedDecoration, []);
  }

  refreshColors(): void {
    this.addedDecoration.dispose();
    this.deletedDecoration.dispose();
    const config = vscode.workspace.getConfiguration("highlightdiff");
    const style = config.get<DecorationStyle>("decorationStyle", "background");
    const addedColor = config.get<string>("addedColor", "rgba(0, 255, 0, 0.1)");
    const deletedColor = config.get<string>("deletedColor", "rgba(255, 0, 0, 0.2)");
    this.addedDecoration = this.createDecoration(style, addedColor, "added");
    this.deletedDecoration = this.createDecoration(style, deletedColor, "deleted");
  }

  dispose(): void {
    this.addedDecoration.dispose();
    this.deletedDecoration.dispose();
  }
}
