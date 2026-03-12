import { execFile } from "child_process";
import { LineDiff, ChangeType } from "./types";

export function runGit(
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

export async function listBranches(workspaceRoot: string): Promise<string[]> {
  try {
    const { stdout } = await runGit(
      ["branch", "-a", "--format=%(refname:short)"],
      workspaceRoot
    );
    return stdout
      .split("\n")
      .map((b) => b.trim())
      .filter((b) => b.length > 0);
  } catch {
    return [];
  }
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

  let i = 0;
  while (i < lines.length) {
    const hunkMatch = hunkHeaderRe.exec(lines[i]);
    if (!hunkMatch) {
      i++;
      continue;
    }

    const oldCount = parseInt(hunkMatch[2] ?? "1", 10);
    const newStart = parseInt(hunkMatch[3], 10) - 1; // 0-based
    const newCount = parseInt(hunkMatch[4] ?? "1", 10);
    i++;

    // Collect removed lines (prefixed with -)
    const oldLines: string[] = [];
    for (let j = 0; j < oldCount && i < lines.length; j++, i++) {
      if (lines[i].startsWith("-")) {
        oldLines.push(lines[i].substring(1));
      }
    }

    // Skip added lines (prefixed with +)
    let addedCount = 0;
    while (addedCount < newCount && i < lines.length && lines[i].startsWith("+")) {
      addedCount++;
      i++;
    }

    // Pure deletion — no new lines
    if (newCount === 0) {
      diffs.push({
        lineNumber: newStart,
        changeType: ChangeType.Deleted,
        oldLines,
      });
    }

    // Added/modified lines — attach old lines to the first one for hover
    if (newCount > 0) {
      for (let j = 0; j < newCount; j++) {
        diffs.push({
          lineNumber: newStart + j,
          changeType: ChangeType.Added,
          oldLines: j === 0 ? oldLines : undefined,
        });
      }
    }
  }

  return diffs;
}
