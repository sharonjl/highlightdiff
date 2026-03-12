export enum ChangeType {
  Added,
  Deleted,
}

export interface LineDiff {
  /** 0-based line number in the current file */
  lineNumber: number;
  changeType: ChangeType;
  /** The old lines that were removed/replaced (for hover display) */
  oldLines?: string[];
}
