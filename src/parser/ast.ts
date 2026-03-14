export type ASTNode =
  | FieldValueNode
  | FieldGroupNode
  | BooleanExprNode
  | GroupNode
  | NotNode
  | SavedSearchNode
  | HistoryRefNode
  | BareTermNode
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
  start: number;
  end: number;
}

export interface BooleanExprNode {
  type: 'BooleanExpr';
  operator: 'AND' | 'OR';
  left: ASTNode;
  right: ASTNode;
  start: number;
  end: number;
}

export interface GroupNode {
  type: 'Group';
  expression: ASTNode;
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

export interface ErrorNode {
  type: 'Error';
  value: string;
  message: string;
  start: number;
  end: number;
}
