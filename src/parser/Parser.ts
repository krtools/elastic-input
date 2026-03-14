import { Token, TokenType } from '../lexer/tokens';
import { ASTNode } from './ast';

export type CursorContextType =
  | 'FIELD_NAME'
  | 'FIELD_VALUE'
  | 'OPERATOR'
  | 'SAVED_SEARCH'
  | 'HISTORY_REF'
  | 'EMPTY';

export interface CursorContext {
  type: CursorContextType;
  partial: string;
  fieldName?: string;
  token?: Token;
}

export class Parser {
  private tokens: Token[];
  private pos: number;
  private nonWsTokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.nonWsTokens = tokens.filter(t => t.type !== TokenType.WHITESPACE);
    this.pos = 0;
  }

  parse(): ASTNode | null {
    if (this.nonWsTokens.length === 0) return null;
    const result = this.parseOr();
    return result;
  }

  private peek(): Token | undefined {
    return this.nonWsTokens[this.pos];
  }

  private advance(): Token {
    return this.nonWsTokens[this.pos++];
  }

  private match(type: TokenType): Token | undefined {
    if (this.peek()?.type === type) {
      return this.advance();
    }
    return undefined;
  }

  private parseOr(): ASTNode {
    let left = this.parseAnd();

    while (this.peek()?.type === TokenType.OR) {
      this.advance();
      const right = this.parseAnd();
      left = {
        type: 'BooleanExpr',
        operator: 'OR',
        left,
        right,
        start: left.start,
        end: right.end,
      };
    }

    return left;
  }

  private parseAnd(): ASTNode {
    let left = this.parseNot();

    while (true) {
      const next = this.peek();
      if (!next) break;

      if (next.type === TokenType.AND) {
        this.advance();
        const right = this.parseNot();
        left = {
          type: 'BooleanExpr',
          operator: 'AND',
          left,
          right,
          start: left.start,
          end: right.end,
        };
      } else if (
        next.type === TokenType.OR ||
        next.type === TokenType.RPAREN
      ) {
        break;
      } else {
        // Implicit AND
        const right = this.parseNot();
        left = {
          type: 'BooleanExpr',
          operator: 'AND',
          left,
          right,
          start: left.start,
          end: right.end,
        };
      }
    }

    return left;
  }

  private parseNot(): ASTNode {
    if (this.peek()?.type === TokenType.NOT) {
      const notToken = this.advance();
      const expr = this.parsePrimary();
      return {
        type: 'Not',
        expression: expr,
        start: notToken.start,
        end: expr.end,
      };
    }
    return this.parsePrimary();
  }

  private applyModifiers(node: ASTNode): ASTNode {
    if (node.type !== 'BareTerm' && node.type !== 'FieldValue') return node;

    // Check for tilde (fuzzy/proximity)
    if (this.peek()?.type === TokenType.TILDE) {
      const tilde = this.advance();
      const numStr = tilde.value.slice(1);
      const n = parseInt(numStr, 10);
      if (node.quoted) {
        node.proximity = isNaN(n) ? 0 : n;
      } else {
        node.fuzzy = isNaN(n) ? 0 : n;
      }
      node.end = tilde.end;
    }

    // Check for boost (caret)
    if (this.peek()?.type === TokenType.BOOST) {
      const caret = this.advance();
      const numStr = caret.value.slice(1);
      const n = parseFloat(numStr);
      node.boost = isNaN(n) ? 1 : n;
      node.end = caret.end;
    }

    return node;
  }

  private parsePrimary(): ASTNode {
    const token = this.peek();

    if (!token) {
      return {
        type: 'Error',
        value: '',
        message: 'Unexpected end of input',
        start: this.nonWsTokens.length > 0
          ? this.nonWsTokens[this.nonWsTokens.length - 1].end
          : 0,
        end: this.nonWsTokens.length > 0
          ? this.nonWsTokens[this.nonWsTokens.length - 1].end
          : 0,
      };
    }

    // Prefix operator: -term (exclude) or +term (require)
    if (token.type === TokenType.PREFIX_OP) {
      const prefixToken = this.advance();
      const expr = this.parsePrimary();
      if (prefixToken.value === '-') {
        return {
          type: 'Not',
          expression: expr,
          start: prefixToken.start,
          end: expr.end,
        };
      }
      // + prefix: just return the expression, adjusting start
      return { ...expr, start: prefixToken.start };
    }

    // Group: (expr)
    if (token.type === TokenType.LPAREN) {
      const lparen = this.advance();
      if (!this.peek() || this.peek()!.type === TokenType.RPAREN) {
        const rp = this.match(TokenType.RPAREN);
        return {
          type: 'Group',
          expression: { type: 'BareTerm', value: '', quoted: false, start: lparen.end, end: lparen.end },
          start: lparen.start,
          end: rp ? rp.end : lparen.end,
        };
      }
      const expr = this.parseOr();
      const rparen = this.match(TokenType.RPAREN);
      return {
        type: 'Group',
        expression: expr,
        start: lparen.start,
        end: rparen ? rparen.end : expr.end,
      };
    }

    // Saved search
    if (token.type === TokenType.SAVED_SEARCH) {
      const t = this.advance();
      return {
        type: 'SavedSearch',
        name: t.value.slice(1), // remove #
        start: t.start,
        end: t.end,
      };
    }

    // History ref
    if (token.type === TokenType.HISTORY_REF) {
      const t = this.advance();
      return {
        type: 'HistoryRef',
        ref: t.value.slice(1), // remove !
        start: t.start,
        end: t.end,
      };
    }

    // Field:value pair
    if (token.type === TokenType.FIELD_NAME) {
      const field = this.advance();
      const colon = this.match(TokenType.COLON);
      if (colon) {
        // Check for comparison op after colon
        let operator = ':';
        const compOp = this.match(TokenType.COMPARISON_OP);
        if (compOp) {
          operator = compOp.value;
        }

        const valueToken = this.peek();
        if (valueToken && (
          valueToken.type === TokenType.VALUE ||
          valueToken.type === TokenType.QUOTED_VALUE ||
          valueToken.type === TokenType.WILDCARD
        )) {
          const val = this.advance();
          const isQuoted = val.type === TokenType.QUOTED_VALUE;
          const rawValue = isQuoted ? val.value.slice(1, -1) : val.value;
          return this.applyModifiers({
            type: 'FieldValue',
            field: field.value,
            operator,
            value: rawValue,
            quoted: isQuoted,
            start: field.start,
            end: val.end,
          });
        }
        // Field with colon but no value yet
        return {
          type: 'FieldValue',
          field: field.value,
          operator,
          value: '',
          quoted: false,
          start: field.start,
          end: compOp ? compOp.end : colon.end,
        };
      }
      // Bare field name without colon — treat as bare term
      return {
        type: 'BareTerm',
        value: field.value,
        quoted: false,
        start: field.start,
        end: field.end,
      };
    }

    // Comparison operator at start (e.g., >100)
    if (token.type === TokenType.COMPARISON_OP) {
      const op = this.advance();
      const val = this.peek();
      if (val && (val.type === TokenType.VALUE || val.type === TokenType.QUOTED_VALUE)) {
        const v = this.advance();
        return {
          type: 'BareTerm',
          value: op.value + v.value,
          quoted: false,
          start: op.start,
          end: v.end,
        };
      }
      return {
        type: 'Error',
        value: op.value,
        message: 'Comparison operator without value',
        start: op.start,
        end: op.end,
      };
    }

    // Quoted value as bare term
    if (token.type === TokenType.QUOTED_VALUE) {
      const t = this.advance();
      return this.applyModifiers({
        type: 'BareTerm',
        value: t.value.slice(1, -1),
        quoted: true,
        start: t.start,
        end: t.end,
      });
    }

    // Wildcard as bare term
    if (token.type === TokenType.WILDCARD) {
      const t = this.advance();
      return this.applyModifiers({
        type: 'BareTerm',
        value: t.value,
        quoted: false,
        start: t.start,
        end: t.end,
      });
    }

    // Plain value
    if (token.type === TokenType.VALUE) {
      const t = this.advance();
      return this.applyModifiers({
        type: 'BareTerm',
        value: t.value,
        quoted: false,
        start: t.start,
        end: t.end,
      });
    }

    // Unknown/unexpected token
    const t = this.advance();
    return {
      type: 'Error',
      value: t.value,
      message: `Unexpected token: ${t.value}`,
      start: t.start,
      end: t.end,
    };
  }

  static getCursorContext(tokens: Token[], cursorOffset: number): CursorContext {
    // Find which token the cursor is in or after
    let currentToken: Token | undefined;
    let prevNonWsToken: Token | undefined;

    for (const token of tokens) {
      if (token.type === TokenType.WHITESPACE) continue;
      if (cursorOffset >= token.start && cursorOffset <= token.end) {
        currentToken = token;
        break;
      }
      if (token.end <= cursorOffset) {
        prevNonWsToken = token;
      }
    }

    // Cursor is on or right after a colon — suggest field values
    if (currentToken?.type === TokenType.COLON) {
      // Find the field name before the colon
      let fieldName = '';
      const colonIdx = tokens.indexOf(currentToken);
      for (let i = colonIdx - 1; i >= 0; i--) {
        if (tokens[i].type === TokenType.FIELD_NAME) {
          fieldName = tokens[i].value;
          break;
        }
        if (tokens[i].type !== TokenType.WHITESPACE) break;
      }
      // If cursor is at the end of the colon and a value token follows,
      // include that value token so replacements cover it
      if (cursorOffset === currentToken.end) {
        for (let i = colonIdx + 1; i < tokens.length; i++) {
          if (tokens[i].type === TokenType.WHITESPACE) continue;
          if (tokens[i].type === TokenType.VALUE ||
              tokens[i].type === TokenType.QUOTED_VALUE ||
              tokens[i].type === TokenType.WILDCARD) {
            const partial = tokens[i].type === TokenType.QUOTED_VALUE
              ? tokens[i].value.slice(1, tokens[i].value.endsWith('"') || tokens[i].value.endsWith("'") ? -1 : undefined)
              : tokens[i].value;
            return { type: 'FIELD_VALUE', partial, fieldName, token: tokens[i] };
          }
          break;
        }
      }
      return { type: 'FIELD_VALUE', partial: '', fieldName, token: undefined };
    }

    // Cursor is in a saved search token
    if (currentToken?.type === TokenType.SAVED_SEARCH) {
      return {
        type: 'SAVED_SEARCH',
        partial: currentToken.value.slice(1), // remove #
        token: currentToken,
      };
    }

    // Cursor is in a history ref token
    if (currentToken?.type === TokenType.HISTORY_REF) {
      return {
        type: 'HISTORY_REF',
        partial: currentToken.value.slice(1), // remove !
        token: currentToken,
      };
    }

    // Right after a colon or comparison op — suggest field values
    if (prevNonWsToken?.type === TokenType.COLON || prevNonWsToken?.type === TokenType.COMPARISON_OP) {
      // Find the field name before the colon/comparison op
      const colonIdx = tokens.indexOf(prevNonWsToken);
      let fieldName = '';
      for (let i = colonIdx - 1; i >= 0; i--) {
        if (tokens[i].type === TokenType.FIELD_NAME) {
          fieldName = tokens[i].value;
          break;
        }
        if (tokens[i].type === TokenType.WHITESPACE ||
            tokens[i].type === TokenType.COLON ||
            tokens[i].type === TokenType.COMPARISON_OP) {
          continue;
        }
        break;
      }

      if (currentToken && (currentToken.type === TokenType.VALUE || currentToken.type === TokenType.QUOTED_VALUE)) {
        const partial = currentToken.type === TokenType.QUOTED_VALUE
          ? currentToken.value.slice(1, currentToken.value.endsWith('"') || currentToken.value.endsWith("'") ? -1 : undefined)
          : currentToken.value;
        return { type: 'FIELD_VALUE', partial, fieldName, token: currentToken };
      }
      return { type: 'FIELD_VALUE', partial: '', fieldName, token: prevNonWsToken };
    }

    // Currently typing a value after a field:
    if (currentToken?.type === TokenType.VALUE || currentToken?.type === TokenType.QUOTED_VALUE) {
      // Check if preceded by a colon or comparison op (possibly with colon before it)
      const currentIdx = tokens.indexOf(currentToken);
      for (let i = currentIdx - 1; i >= 0; i--) {
        if (tokens[i].type === TokenType.WHITESPACE) continue;
        if (tokens[i].type === TokenType.COLON || tokens[i].type === TokenType.COMPARISON_OP) {
          let fieldName = '';
          for (let j = i - 1; j >= 0; j--) {
            if (tokens[j].type === TokenType.FIELD_NAME) {
              fieldName = tokens[j].value;
              break;
            }
            // Skip whitespace, colon, and comparison ops to reach the field name
            if (tokens[j].type === TokenType.WHITESPACE ||
                tokens[j].type === TokenType.COLON ||
                tokens[j].type === TokenType.COMPARISON_OP) {
              continue;
            }
            break;
          }
          const partial = currentToken.type === TokenType.QUOTED_VALUE
            ? currentToken.value.slice(1, currentToken.value.endsWith('"') || currentToken.value.endsWith("'") ? -1 : undefined)
            : currentToken.value;
          return { type: 'FIELD_VALUE', partial, fieldName, token: currentToken };
        }
        break;
      }
    }

    // Bare quoted value (phrase) — not after a colon, so no suggestions
    if (currentToken?.type === TokenType.QUOTED_VALUE) {
      return { type: 'FIELD_NAME', partial: currentToken.value, token: currentToken };
    }

    // Currently typing a field name
    if (currentToken?.type === TokenType.FIELD_NAME || currentToken?.type === TokenType.VALUE) {
      return {
        type: 'FIELD_NAME',
        partial: currentToken.value,
        token: currentToken,
      };
    }

    // After prefix op — suggest field names
    if (prevNonWsToken?.type === TokenType.PREFIX_OP) {
      return { type: 'FIELD_NAME', partial: '', token: undefined };
    }

    // After AND/OR/NOT — could be operator context or start of a new term
    if (prevNonWsToken && (
      prevNonWsToken.type === TokenType.AND ||
      prevNonWsToken.type === TokenType.OR ||
      prevNonWsToken.type === TokenType.NOT
    )) {
      return { type: 'FIELD_NAME', partial: '', token: undefined };
    }

    // Empty or at whitespace
    if (tokens.length === 0 || tokens.every(t => t.type === TokenType.WHITESPACE)) {
      return { type: 'EMPTY', partial: '' };
    }

    // Inside or right after LPAREN — start of a new sub-expression
    if (currentToken?.type === TokenType.LPAREN ||
        prevNonWsToken?.type === TokenType.LPAREN) {
      return { type: 'FIELD_NAME', partial: '', token: undefined };
    }

    // Cursor on a modifier token — treat as operator context (no suggestions needed)
    if (currentToken?.type === TokenType.TILDE || currentToken?.type === TokenType.BOOST) {
      return { type: 'OPERATOR', partial: '' };
    }

    // After a complete value or modifier — suggest operators
    if (prevNonWsToken && (
      prevNonWsToken.type === TokenType.VALUE ||
      prevNonWsToken.type === TokenType.QUOTED_VALUE ||
      prevNonWsToken.type === TokenType.RPAREN ||
      prevNonWsToken.type === TokenType.TILDE ||
      prevNonWsToken.type === TokenType.BOOST
    )) {
      return { type: 'OPERATOR', partial: '' };
    }

    return { type: 'FIELD_NAME', partial: '', token: undefined };
  }
}
