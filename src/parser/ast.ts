export type ASTNode =
  | FieldValueNode
  | FieldGroupNode
  | BooleanExprNode
  | GroupNode
  | NotNode
  | SavedSearchNode
  | HistoryRefNode
  | BareTermNode
  | RegexNode
  | RangeNode
  | ErrorNode;

export interface FieldValueNode {
  type: 'FieldValue';
  field: string;
  operator: string; // ':', '>', '<', '>=', '<='
  value: string;
  quoted: boolean;
  boost?: number;
  fuzzy?: number;
  proximity?: number;
  start: number;
  end: number;
}

export interface FieldGroupNode {
  type: 'FieldGroup';
  field: string;
  expression: ASTNode;
  boost?: number;
  start: number;
  end: number;
}

export interface BooleanExprNode {
  type: 'BooleanExpr';
  operator: 'AND' | 'OR';
  left: ASTNode;
  right: ASTNode;
  /** True when the operator was inferred from whitespace (no explicit AND/OR token). */
  implicit?: boolean;
  start: number;
  end: number;
}

export interface GroupNode {
  type: 'Group';
  expression: ASTNode;
  boost?: number;
  start: number;
  end: number;
}

export interface NotNode {
  type: 'Not';
  expression: ASTNode;
  start: number;
  end: number;
}

export interface SavedSearchNode {
  type: 'SavedSearch';
  name: string;
  start: number;
  end: number;
}

export interface HistoryRefNode {
  type: 'HistoryRef';
  ref: string;
  start: number;
  end: number;
}

export interface BareTermNode {
  type: 'BareTerm';
  value: string;
  quoted: boolean;
  boost?: number;
  fuzzy?: number;
  proximity?: number;
  start: number;
  end: number;
}

export interface RegexNode {
  type: 'Regex';
  pattern: string;
  start: number;
  end: number;
}

export interface RangeNode {
  type: 'Range';
  field?: string;
  lower: string;
  upper: string;
  lowerInclusive: boolean;
  upperInclusive: boolean;
  lowerQuoted: boolean;
  upperQuoted: boolean;
  /** Character offset of the lower bound value (inclusive). */
  lowerStart: number;
  /** Character offset of the lower bound value (exclusive). */
  lowerEnd: number;
  /** Character offset of the upper bound value (inclusive). */
  upperStart: number;
  /** Character offset of the upper bound value (exclusive). */
  upperEnd: number;
  start: number;
  end: number;
}

export interface ErrorNode {
  type: 'Error';
  value: string;
  message: string;
  start: number;
  end: number;
}
