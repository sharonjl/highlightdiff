import * as vscode from "vscode";
import * as path from "path";
import { getBlame } from "./gitDiff";

export class BlameManager {
  private decoration: vscode.TextEditorDecorationType;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.decoration = vscode.window.createTextEditorDecorationType({
      after: {
        color: new vscode.ThemeColor("editorCodeLens.foreground"),
        fontStyle: "italic",
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

    // Show blame for current cursor position immediately
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
