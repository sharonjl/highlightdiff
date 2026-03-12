export enum ChangeType {
  Added,
  Deleted,
}

export interface LineDiff {
  /** 0-based line number in the current file */
  lineNumber: number;
  changeType: ChangeType;
}
