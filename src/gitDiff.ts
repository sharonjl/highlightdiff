import { execFile } from "child_process";
import { LineDiff, ChangeType, BlameInfo, ChangedFileInfo } from "./types";

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

export async function getBlame(
  workspaceRoot: string,
  filePath: string,
  lineNumber: number
): Promise<BlameInfo | undefined> {
  try {
    const line1 = lineNumber + 1; // git blame is 1-based
    const { stdout } = await runGit(
      ["blame", "--porcelain", `-L${line1},${line1}`, "--", filePath],
      workspaceRoot
    );

    let author = "";
    let date = "";
    let summary = "";

    for (const line of stdout.split("\n")) {
      if (line.startsWith("author ")) {
        author = line.substring(7);
      } else if (line.startsWith("author-time ")) {
        const timestamp = parseInt(line.substring(12), 10);
        date = formatRelativeDate(timestamp);
      } else if (line.startsWith("summary ")) {
        summary = line.substring(8);
      }
    }

    if (!author) {
      return undefined;
    }

    // Uncommitted changes show as "Not Committed Yet"
    if (author === "Not Committed Yet") {
      return { author: "You", date: "uncommitted", summary: "Uncommitted changes" };
    }

    return { author, date, summary };
  } catch {
    return undefined;
  }
}

function formatRelativeDate(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo ago`;
  return `${Math.floor(diff / 31536000)}y ago`;
}

export async function detectTargetBranch(workspaceRoot: string): Promise<string> {
  // 1. Try gh pr view to get the PR base branch
  try {
    const { stdout } = await runCommand(
      "gh",
      ["pr", "view", "--json", "baseRefName", "--jq", ".baseRefName"],
      workspaceRoot
    );
    const branch = stdout.trim();
    if (branch) return branch;
  } catch {
    // gh not installed or no PR exists
  }

  // 2. Try upstream tracking branch
  try {
    const { stdout } = await runGit(
      ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
      workspaceRoot
    );
    const upstream = stdout.trim();
    if (upstream) {
      // Extract the branch name from e.g. "origin/main"
      const parts = upstream.split("/");
      return parts.length > 1 ? parts.slice(1).join("/") : upstream;
    }
  } catch {
    // No upstream set
  }

  // 3. Try common default branches
  for (const candidate of ["main", "master"]) {
    try {
      await runGit(["rev-parse", "--verify", candidate], workspaceRoot);
      return candidate;
    } catch {
      // Branch doesn't exist
    }
  }

  return "main";
}

function runCommand(
  cmd: string,
  args: string[],
  cwd: string
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, maxBuffer: 10 * 1024 * 1024, timeout: 5000 }, (err, stdout, stderr) => {
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
    const { stdout: mergeBase } = await runGit(
      ["merge-base", targetBranch, "HEAD"],
      workspaceRoot
    );
    const base = mergeBase.trim();

    const { stdout } = await runGit(
      ["diff", base, "HEAD", "--unified=0", "--", filePath],
      workspaceRoot
    );

    return parseDiff(stdout);
  } catch {
    return [];
  }
}

export async function getChangedFiles(
  workspaceRoot: string,
  targetBranch: string
): Promise<ChangedFileInfo[]> {
  try {
    const { stdout: mergeBase } = await runGit(
      ["merge-base", targetBranch, "HEAD"],
      workspaceRoot
    );
    const base = mergeBase.trim();

    const { stdout } = await runGit(
      ["diff", "--name-status", base, "HEAD"],
      workspaceRoot
    );

    return stdout
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const [status, ...rest] = line.split("\t");
        return {
          status: status.charAt(0) as ChangedFileInfo["status"],
          filePath: rest.join("\t"),
        };
      });
  } catch {
    return [];
  }
}

const hunkHeaderRe = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function parseDiff(diffOutput: string): LineDiff[] {
  const diffs: LineDiff[] = [];
  const lines = diffOutput.split("\n");

  for (const line of lines) {
    const hunkMatch = hunkHeaderRe.exec(line);
    if (!hunkMatch) continue;

    const newStart = parseInt(hunkMatch[3], 10) - 1;
    const newCount = parseInt(hunkMatch[4] ?? "1", 10);

    if (newCount === 0) {
      diffs.push({ lineNumber: newStart, changeType: ChangeType.Deleted });
    }

    if (newCount > 0) {
      for (let j = 0; j < newCount; j++) {
        diffs.push({ lineNumber: newStart + j, changeType: ChangeType.Added });
      }
    }
  }

  return diffs;
}
