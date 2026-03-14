export enum TokenType {
  FIELD_NAME = 'FIELD_NAME',
  COLON = 'COLON',
  VALUE = 'VALUE',
  QUOTED_VALUE = 'QUOTED_VALUE',
  AND = 'AND',
  OR = 'OR',
  NOT = 'NOT',
  COMPARISON_OP = 'COMPARISON_OP',
  LPAREN = 'LPAREN',
  RPAREN = 'RPAREN',
  SAVED_SEARCH = 'SAVED_SEARCH',
  HISTORY_REF = 'HISTORY_REF',
  PREFIX_OP = 'PREFIX_OP',
  WILDCARD = 'WILDCARD',
  REGEX = 'REGEX',
  RANGE = 'RANGE',
  TILDE = 'TILDE',
  BOOST = 'BOOST',
  WHITESPACE = 'WHITESPACE',
  UNKNOWN = 'UNKNOWN',
}

export interface Token {
  type: TokenType;
  value: string;
  start: number;
  end: number;
}
