import * as vscode from "vscode";
import { LineDiff, ChangeType } from "./types";

type DecorationStyle = "background" | "gutter" | "border" | "overview-ruler";

export class DecorationManager {
  private addedDecoration: vscode.TextEditorDecorationType;
  private deletedDecoration: vscode.TextEditorDecorationType;

  constructor() {
    const config = vscode.workspace.getConfiguration("highlightdiff");
    const style = config.get<DecorationStyle>("decorationStyle", "background");
    const addedColor = config.get<string>("addedColor", "#00ff001a");
    const deletedColor = config.get<string>("deletedColor", "#ff000033");
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
            gutterIconSize: "contain",
          });
        }
        return vscode.window.createTextEditorDecorationType({
          backgroundColor: color,
          isWholeLine: true,
          overviewRulerColor: rulerColor,
          overviewRulerLane: vscode.OverviewRulerLane.Left,
          // Extend color into the gutter via a left border
          borderWidth: "0 0 0 4px",
          borderStyle: "solid",
          borderColor: color,
          gutterIconSize: "contain",
        });

      case "gutter":
        return vscode.window.createTextEditorDecorationType({
          borderWidth: "0 0 0 4px",
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
    const addedLines = new Set<number>();
    const deletedLines = new Set<number>();

    for (const diff of diffs) {
      const line = Math.min(diff.lineNumber, editor.document.lineCount - 1);
      if (diff.changeType === ChangeType.Added) {
        addedLines.add(line);
      } else {
        deletedLines.add(line);
      }
    }

    // Remove deleted markers on lines that are also added (modification takes precedence)
    for (const line of addedLines) {
      deletedLines.delete(line);
    }

    const toOptions = (line: number) => ({
      range: new vscode.Range(line, 0, line, 0),
    });

    editor.setDecorations(this.addedDecoration, [...addedLines].map(toOptions));
    editor.setDecorations(this.deletedDecoration, [...deletedLines].map(toOptions));
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
    const addedColor = config.get<string>("addedColor", "#00ff001a");
    const deletedColor = config.get<string>("deletedColor", "#ff000033");
    this.addedDecoration = this.createDecoration(style, addedColor, "added");
    this.deletedDecoration = this.createDecoration(style, deletedColor, "deleted");
  }

  dispose(): void {
    this.addedDecoration.dispose();
    this.deletedDecoration.dispose();
  }
}
