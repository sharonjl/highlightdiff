export enum ChangeType {
  Added,
  Deleted,
}

export interface LineDiff {
  /** 0-based line number in the current file */
  lineNumber: number;
  changeType: ChangeType;
}

export interface BlameInfo {
  author: string;
  date: string;
  summary: string;
}

export interface ChangedFileInfo {
  filePath: string;
  status: "A" | "M" | "D" | "R" | string;
}
