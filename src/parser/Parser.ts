import { Token, TokenType } from '../lexer/tokens';
import { ASTNode, ErrorNode, GroupNode, FieldGroupNode, RangeNode } from './ast';

export type CursorContextType =
  | 'FIELD_NAME'
  | 'FIELD_VALUE'
  | 'OPERATOR'
  | 'RANGE'
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
  private errors: ErrorNode[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.nonWsTokens = tokens.filter(t => t.type !== TokenType.WHITESPACE);
    this.pos = 0;
  }

  getErrors(): ErrorNode[] {
    return this.errors;
  }

  /** Check if a QUOTED_VALUE token is missing its closing quote. */
  private isUnclosedQuote(token: Token): boolean {
    if (token.type !== TokenType.QUOTED_VALUE) return false;
    const v = token.value;
    if (v.length < 2) return true;
    const open = v[0];
    return v[v.length - 1] !== open;
  }

  /** Strip quotes from a QUOTED_VALUE token, handling unclosed quotes correctly. */
  private stripQuotes(token: Token): string {
    const v = token.value;
    if (this.isUnclosedQuote(token)) {
      return v.slice(1); // only strip the opening quote
    }
    return v.slice(1, -1); // strip both
  }

  /** If the token is an unclosed quote, push an error. */
  private checkUnclosedQuote(token: Token): void {
    if (this.isUnclosedQuote(token)) {
      this.errors.push({
        type: 'Error',
        value: token.value[0],
        message: 'Missing closing quote',
        start: token.start,
        end: token.start + 1,
      });
    }
  }

  parse(): ASTNode | null {
    if (this.nonWsTokens.length === 0) return null;
    let result = this.parseOr();

    // Handle unconsumed tokens (e.g. stray closing parens)
    while (this.peek()) {
      const token = this.peek()!;
      if (token.type === TokenType.RPAREN) {
        this.advance();
        this.errors.push({
          type: 'Error',
          value: token.value,
          message: 'Unexpected closing parenthesis',
          start: token.start,
          end: token.end,
        });
      } else {
        // Re-parse remaining tokens via implicit AND
        const right = this.parseOr();
        result = {
          type: 'BooleanExpr',
          operator: 'AND',
          left: result,
          right,
          implicit: true,
          start: result.start,
          end: right.end,
        };
      }
    }

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
      const orToken = this.advance();
      const right = this.parseAnd();
      if (right.type === 'Error' && right.value === '') {
        // Trailing OR with no right operand
        this.errors.push({
          type: 'Error',
          value: orToken.value,
          message: 'Missing search term after OR',
          start: orToken.start,
          end: orToken.end,
        });
        // Don't create BooleanExpr — just return left
        break;
      }
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
        const andToken = this.advance();
        const right = this.parseNot();
        if (right.type === 'Error' && right.value === '') {
          // Trailing AND with no right operand
          this.errors.push({
            type: 'Error',
            value: andToken.value,
            message: 'Missing search term after AND',
            start: andToken.start,
            end: andToken.end,
          });
          break;
        }
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
          implicit: true,
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
      if (expr.type === 'Error' && expr.value === '') {
        // NOT with no operand
        this.errors.push({
          type: 'Error',
          value: notToken.value,
          message: 'Missing search term after NOT',
          start: notToken.start,
          end: notToken.end,
        });
        return expr;
      }
      return {
        type: 'Not',
        expression: expr,
        start: notToken.start,
        end: expr.end,
      };
    }
    return this.parsePrimary();
  }

  private applyGroupBoost(node: GroupNode | FieldGroupNode): GroupNode | FieldGroupNode {
    if (this.peek()?.type === TokenType.BOOST) {
      const caret = this.advance();
      const numStr = caret.value.slice(1);
      const n = parseFloat(numStr);
      node.boost = isNaN(n) ? 1 : n;
      node.end = caret.end;
    }
    return node;
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

  private parseRangeBound(text: string, baseOffset: number): { value: string; quoted: boolean; valueStart: number; valueEnd: number } {
    // Find the trimmed content's position within the raw text
    const leadingWs = text.length - text.trimStart().length;
    const trimmed = text.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
      return { value: trimmed.slice(1, -1), quoted: true, valueStart: baseOffset + leadingWs, valueEnd: baseOffset + leadingWs + trimmed.length };
    }
    if (trimmed.startsWith('"')) {
      // Unclosed quote
      return { value: trimmed.slice(1), quoted: true, valueStart: baseOffset + leadingWs, valueEnd: baseOffset + leadingWs + trimmed.length };
    }
    return { value: trimmed, quoted: false, valueStart: baseOffset + leadingWs, valueEnd: baseOffset + leadingWs + trimmed.length };
  }

  private parseRange(token: Token): RangeNode {
    const raw = token.value;
    const openBracket = raw[0];
    const lowerInclusive = openBracket === '[';

    // Check for closing bracket
    const lastChar = raw[raw.length - 1];
    const hasClosed = lastChar === ']' || lastChar === '}';
    const upperInclusive = lastChar === ']';

    if (!hasClosed) {
      this.errors.push({
        type: 'Error',
        value: openBracket,
        message: 'Unclosed range expression',
        start: token.start,
        end: token.start + 1,
      });
    }

    // Extract inner content (between brackets)
    const inner = hasClosed ? raw.slice(1, -1) : raw.slice(1);

    // Split on TO (case-insensitive, whitespace-bounded)
    const toMatch = inner.match(/^(.*?)\s+[Tt][Oo]\s+(.*)$/);

    // Inner content starts after the opening bracket
    const innerStart = token.start + 1;

    if (!toMatch) {
      this.errors.push({
        type: 'Error',
        value: raw,
        message: 'Range expression missing TO keyword',
        start: token.start,
        end: token.end,
      });
      // Best-effort: treat entire inner content as lower bound
      const bound = this.parseRangeBound(inner, innerStart);
      return {
        type: 'Range',
        lower: bound.value,
        upper: '',
        lowerInclusive,
        upperInclusive: hasClosed ? upperInclusive : true,
        lowerQuoted: bound.quoted,
        upperQuoted: false,
        lowerStart: bound.valueStart,
        lowerEnd: bound.valueEnd,
        upperStart: token.end,
        upperEnd: token.end,
        start: token.start,
        end: token.end,
      };
    }

    const lowerBound = this.parseRangeBound(toMatch[1], innerStart);
    // Upper bound starts after the lower capture + the TO separator
    const upperBaseOffset = innerStart + toMatch[1].length + (inner.length - toMatch[1].length - toMatch[2].length);
    const upperBound = this.parseRangeBound(toMatch[2], upperBaseOffset);

    return {
      type: 'Range',
      lower: lowerBound.value,
      upper: upperBound.value,
      lowerInclusive,
      upperInclusive: hasClosed ? upperInclusive : true,
      lowerQuoted: lowerBound.quoted,
      upperQuoted: upperBound.quoted,
      lowerStart: lowerBound.valueStart,
      lowerEnd: lowerBound.valueEnd,
      upperStart: upperBound.valueStart,
      upperEnd: upperBound.valueEnd,
      start: token.start,
      end: token.end,
    };
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

    // Unexpected AND/OR at start of expression
    if (token.type === TokenType.AND) {
      const t = this.advance();
      this.errors.push({
        type: 'Error',
        value: t.value,
        message: 'Unexpected AND',
        start: t.start,
        end: t.end,
      });
      // Continue parsing — treat next token as the primary
      return this.parsePrimary();
    }

    if (token.type === TokenType.OR) {
      const t = this.advance();
      this.errors.push({
        type: 'Error',
        value: t.value,
        message: 'Unexpected OR',
        start: t.start,
        end: t.end,
      });
      return this.parsePrimary();
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
        if (!rp) {
          this.errors.push({
            type: 'Error',
            value: lparen.value,
            message: 'Unclosed parenthesis',
            start: lparen.start,
            end: lparen.end,
          });
        }
        const emptyGroup: GroupNode = {
          type: 'Group',
          expression: { type: 'BareTerm', value: '', quoted: false, start: lparen.end, end: lparen.end },
          start: lparen.start,
          end: rp ? rp.end : lparen.end,
        };
        return this.applyGroupBoost(emptyGroup);
      }
      const expr = this.parseOr();
      const rparen = this.match(TokenType.RPAREN);
      if (!rparen) {
        this.errors.push({
          type: 'Error',
          value: lparen.value,
          message: 'Missing closing parenthesis',
          start: lparen.start,
          end: lparen.end,
        });
      }
      const groupNode: GroupNode = {
        type: 'Group',
        expression: expr,
        start: lparen.start,
        end: rparen ? rparen.end : expr.end,
      };
      return this.applyGroupBoost(groupNode);
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

        // Field-scoped group: field:(expr)
        if (this.peek()?.type === TokenType.LPAREN) {
          const lparen = this.advance();
          if (!this.peek() || this.peek()!.type === TokenType.RPAREN) {
            const rp = this.match(TokenType.RPAREN);
            if (!rp) {
              this.errors.push({
                type: 'Error',
                value: lparen.value,
                message: 'Unclosed parenthesis',
                start: lparen.start,
                end: lparen.end,
              });
            }
            const emptyFieldGroup: FieldGroupNode = {
              type: 'FieldGroup',
              field: field.value,
              expression: { type: 'BareTerm', value: '', quoted: false, start: lparen.end, end: lparen.end },
              start: field.start,
              end: rp ? rp.end : lparen.end,
            };
            return this.applyGroupBoost(emptyFieldGroup);
          }
          const expr = this.parseOr();
          const rparen = this.match(TokenType.RPAREN);
          if (!rparen) {
            this.errors.push({
              type: 'Error',
              value: lparen.value,
              message: 'Missing closing parenthesis',
              start: lparen.start,
              end: lparen.end,
            });
          }
          const fieldGroupNode: FieldGroupNode = {
            type: 'FieldGroup',
            field: field.value,
            expression: expr,
            start: field.start,
            end: rparen ? rparen.end : expr.end,
          };
          return this.applyGroupBoost(fieldGroupNode);
        }

        // Range value for field
        if (this.peek()?.type === TokenType.RANGE) {
          const rangeToken = this.advance();
          const node = this.parseRange(rangeToken);
          node.field = field.value;
          node.start = field.start;
          return node;
        }

        // Regex value for field
        if (this.peek()?.type === TokenType.REGEX) {
          const val = this.advance();
          return {
            type: 'Regex',
            pattern: val.value.slice(1, -1),
            start: field.start,
            end: val.end,
          };
        }

        const valueToken = this.peek();
        if (valueToken && (
          valueToken.type === TokenType.VALUE ||
          valueToken.type === TokenType.QUOTED_VALUE ||
          valueToken.type === TokenType.WILDCARD
        )) {
          const val = this.advance();
          const isQuoted = val.type === TokenType.QUOTED_VALUE;
          if (isQuoted) this.checkUnclosedQuote(val);
          const rawValue = isQuoted ? this.stripQuotes(val) : val.value;
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
      this.checkUnclosedQuote(t);
      return this.applyModifiers({
        type: 'BareTerm',
        value: this.stripQuotes(t),
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

    // Range expression as standalone
    if (token.type === TokenType.RANGE) {
      const t = this.advance();
      return this.parseRange(t);
    }

    // Regex literal as bare term
    if (token.type === TokenType.REGEX) {
      const t = this.advance();
      return {
        type: 'Regex',
        pattern: t.value.slice(1, -1), // remove surrounding /
        start: t.start,
        end: t.end,
      };
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

    // Stray closing paren at expression start
    if (token.type === TokenType.RPAREN) {
      const t = this.advance();
      this.errors.push({
        type: 'Error',
        value: t.value,
        message: 'Unexpected closing parenthesis',
        start: t.start,
        end: t.end,
      });
      return {
        type: 'Error',
        value: t.value,
        message: 'Unexpected closing parenthesis',
        start: t.start,
        end: t.end,
      };
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

    // Helper: scan backwards from a token index to find an enclosing field group.
    // Looks for the pattern FIELD_NAME COLON LPAREN by tracking unmatched LPAREN depth.
    // Returns the field name if found, empty string otherwise.
    const findEnclosingFieldGroup = (fromIndex: number): string => {
      let depth = 0;
      for (let i = fromIndex; i >= 0; i--) {
        const t = tokens[i];
        if (t.type === TokenType.WHITESPACE) continue;
        if (t.type === TokenType.RPAREN) { depth++; continue; }
        if (t.type === TokenType.LPAREN) {
          if (depth > 0) { depth--; continue; }
          // Found an unmatched LPAREN — check for FIELD_NAME COLON before it
          for (let j = i - 1; j >= 0; j--) {
            if (tokens[j].type === TokenType.WHITESPACE) continue;
            if (tokens[j].type === TokenType.COLON) {
              for (let k = j - 1; k >= 0; k--) {
                if (tokens[k].type === TokenType.WHITESPACE) continue;
                if (tokens[k].type === TokenType.FIELD_NAME) return tokens[k].value;
                break;
              }
            }
            break;
          }
          // Not a field group LPAREN — keep scanning outward through nested parens
        }
      }
      return '';
    };

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
      // Cursor at start of colon with no preceding field name — suggest field names
      // Pass the colon token so the replacement range covers it (field suggestions include ':')
      if (!fieldName && cursorOffset === currentToken.start) {
        return { type: 'FIELD_NAME', partial: '', token: currentToken };
      }
      // If cursor is at the end of the colon and a value token follows,
      // include that value token so replacements cover it
      if (cursorOffset === currentToken.end) {
        for (let i = colonIdx + 1; i < tokens.length; i++) {
          if (tokens[i].type === TokenType.WHITESPACE) continue;
          if (tokens[i].type === TokenType.VALUE ||
              tokens[i].type === TokenType.QUOTED_VALUE ||
              tokens[i].type === TokenType.WILDCARD ||
              tokens[i].type === TokenType.RANGE) {
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

    // Cursor is inside a range expression
    if (currentToken?.type === TokenType.RANGE) {
      const rangeIdx = tokens.indexOf(currentToken);
      let fieldName = '';
      for (let i = rangeIdx - 1; i >= 0; i--) {
        if (tokens[i].type === TokenType.FIELD_NAME) { fieldName = tokens[i].value; break; }
        if (tokens[i].type === TokenType.WHITESPACE || tokens[i].type === TokenType.COLON) continue;
        break;
      }
      return { type: 'RANGE', partial: '', fieldName, token: currentToken };
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

    // Currently typing a field name — or a value inside a field group
    if (currentToken?.type === TokenType.FIELD_NAME || currentToken?.type === TokenType.VALUE) {
      const groupField = findEnclosingFieldGroup(tokens.indexOf(currentToken));
      if (groupField) {
        return { type: 'FIELD_VALUE', partial: currentToken.value, fieldName: groupField, token: currentToken };
      }
      return {
        type: 'FIELD_NAME',
        partial: currentToken.value,
        token: currentToken,
      };
    }

    // After prefix op — suggest field names (or field values inside a field group)
    if (prevNonWsToken?.type === TokenType.PREFIX_OP) {
      const groupField = findEnclosingFieldGroup(tokens.indexOf(prevNonWsToken));
      if (groupField) {
        return { type: 'FIELD_VALUE', partial: '', fieldName: groupField, token: undefined };
      }
      return { type: 'FIELD_NAME', partial: '', token: undefined };
    }

    // After AND/OR/NOT — could be operator context or start of a new term
    if (prevNonWsToken && (
      prevNonWsToken.type === TokenType.AND ||
      prevNonWsToken.type === TokenType.OR ||
      prevNonWsToken.type === TokenType.NOT
    )) {
      const groupField = findEnclosingFieldGroup(tokens.indexOf(prevNonWsToken));
      if (groupField) {
        return { type: 'FIELD_VALUE', partial: '', fieldName: groupField, token: undefined };
      }
      return { type: 'FIELD_NAME', partial: '', token: undefined };
    }

    // Empty or at whitespace
    if (tokens.length === 0 || tokens.every(t => t.type === TokenType.WHITESPACE)) {
      return { type: 'EMPTY', partial: '' };
    }

    // Inside or right after LPAREN — start of a new sub-expression
    if (currentToken?.type === TokenType.LPAREN ||
        prevNonWsToken?.type === TokenType.LPAREN) {
      const lparenToken = (currentToken?.type === TokenType.LPAREN ? currentToken : prevNonWsToken)!;
      const groupField = findEnclosingFieldGroup(tokens.indexOf(lparenToken));
      if (groupField) {
        return { type: 'FIELD_VALUE', partial: '', fieldName: groupField, token: undefined };
      }
      return { type: 'FIELD_NAME', partial: '', token: undefined };
    }

    // Cursor on a modifier token — treat as operator context (no suggestions needed)
    if (currentToken?.type === TokenType.TILDE || currentToken?.type === TokenType.BOOST) {
      return { type: 'OPERATOR', partial: '' };
    }

    // After a complete value or modifier — suggest operators (or field values in a field group)
    if (prevNonWsToken && (
      prevNonWsToken.type === TokenType.VALUE ||
      prevNonWsToken.type === TokenType.QUOTED_VALUE ||
      prevNonWsToken.type === TokenType.RPAREN ||
      prevNonWsToken.type === TokenType.RANGE ||
      prevNonWsToken.type === TokenType.TILDE ||
      prevNonWsToken.type === TokenType.BOOST
    )) {
      const groupField = findEnclosingFieldGroup(tokens.indexOf(prevNonWsToken));
      if (groupField) {
        return { type: 'FIELD_VALUE', partial: '', fieldName: groupField, token: undefined };
      }
      return { type: 'OPERATOR', partial: '' };
    }

    return { type: 'FIELD_NAME', partial: '', token: undefined };
  }
}
