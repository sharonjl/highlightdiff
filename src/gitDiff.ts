import { execFile } from "child_process";
import { LineDiff, ChangeType } from "./types";

function runGit(
  args: string[],
  cwd: string
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(err);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

export async function getChangedLines(
  workspaceRoot: string,
  filePath: string,
  targetBranch: string
): Promise<LineDiff[]> {
  try {
    // Use merge-base to diff only what the branch introduced
    const { stdout: mergeBase } = await runGit(
      ["merge-base", targetBranch, "HEAD"],
      workspaceRoot
    );
    const base = mergeBase.trim();

    const { stdout } = await runGit(
      ["diff", base, "--unified=0", "--", filePath],
      workspaceRoot
    );

    return parseDiff(stdout);
  } catch {
    // Not a git repo, target branch doesn't exist, file is untracked, etc.
    return [];
  }
}

const hunkHeaderRe = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function parseDiff(diffOutput: string): LineDiff[] {
  const diffs: LineDiff[] = [];
  const lines = diffOutput.split("\n");

  let currentLine = 0;

  for (const line of lines) {
    const hunkMatch = hunkHeaderRe.exec(line);
    if (hunkMatch) {
      // +start is 1-based in diff output
      currentLine = parseInt(hunkMatch[3], 10) - 1; // convert to 0-based
      const oldCount = parseInt(hunkMatch[2] ?? "1", 10);
      const newCount = parseInt(hunkMatch[4] ?? "1", 10);

      // Pure deletion (new side has 0 lines) — mark the line after the deletion point
      if (newCount === 0) {
        // currentLine is now pointing at the line before which content was deleted
        // In --unified=0 format with +start,0, start is the line AFTER which deletions happened
        diffs.push({ lineNumber: currentLine, changeType: ChangeType.Deleted });
      }

      // Pure addition or modification — mark each added line
      if (newCount > 0) {
        for (let i = 0; i < newCount; i++) {
          diffs.push({
            lineNumber: currentLine + i,
            changeType: ChangeType.Added,
          });
        }
      }

      continue;
    }
  }

  return diffs;
}
