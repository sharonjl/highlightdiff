import * as vscode from "vscode";
import * as path from "path";
import { getBlame } from "./gitDiff";

export class BlameManager {
  private decoration: vscode.TextEditorDecorationType;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.decoration = this.createDecoration();
  }

  private createDecoration(): vscode.TextEditorDecorationType {
    const config = vscode.workspace.getConfiguration("highlightdiff");
    const fontStyle = config.get<string>("blameFontStyle", "normal");
    const blameColor = config.get<string>("blameColor", "");

    return vscode.window.createTextEditorDecorationType({
      after: {
        color: blameColor || new vscode.ThemeColor("editorCodeLens.foreground"),
        fontStyle,
        margin: "0 0 0 3em",
      },
    });
  }

  start(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.window.onDidChangeTextEditorSelection((e) => {
        this.updateBlame(e.textEditor);
      })
    );

    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          this.updateBlame(editor);
        }
      })
    );

    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("highlightdiff.blameFontStyle") ||
            e.affectsConfiguration("highlightdiff.blameColor")) {
          this.refreshDecoration();
        }
      })
    );

    if (vscode.window.activeTextEditor) {
      this.updateBlame(vscode.window.activeTextEditor);
    }
  }

  private refreshDecoration(): void {
    this.decoration.dispose();
    this.decoration = this.createDecoration();
    if (vscode.window.activeTextEditor) {
      this.updateBlame(vscode.window.activeTextEditor);
    }
  }

  private async updateBlame(editor: vscode.TextEditor): Promise<void> {
    if (editor.document.uri.scheme !== "file") {
      editor.setDecorations(this.decoration, []);
      return;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    if (!workspaceFolder) {
      editor.setDecorations(this.decoration, []);
      return;
    }

    const lineNumber = editor.selection.active.line;
    const filePath = path.relative(workspaceFolder.uri.fsPath, editor.document.uri.fsPath);

    const blame = await getBlame(workspaceFolder.uri.fsPath, filePath, lineNumber);

    if (!blame) {
      editor.setDecorations(this.decoration, []);
      return;
    }

    const lineEnd = editor.document.lineAt(lineNumber).range.end;
    const text = `${blame.author}, ${blame.date} — ${blame.summary}`;

    editor.setDecorations(this.decoration, [
      {
        range: new vscode.Range(lineEnd, lineEnd),
        renderOptions: {
          after: { contentText: text },
        },
      },
    ]);
  }

  clear(editor: vscode.TextEditor): void {
    editor.setDecorations(this.decoration, []);
  }

  dispose(): void {
    this.decoration.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
