import { Token, TokenType } from './tokens';

enum LexerState {
  EXPECT_TERM,
  EXPECT_VALUE,
}

export class Lexer {
  private input: string;
  private pos: number;
  private state: LexerState;
  private tokens: Token[];

  constructor(input: string) {
    this.input = input;
    this.pos = 0;
    this.state = LexerState.EXPECT_TERM;
    this.tokens = [];
  }

  tokenize(): Token[] {
    this.tokens = [];
    this.pos = 0;
    this.state = LexerState.EXPECT_TERM;

    while (this.pos < this.input.length) {
      if ((this.state as LexerState) === LexerState.EXPECT_VALUE) {
        this.readValue();
      } else {
        this.readTerm();
      }
    }

    return this.tokens;
  }

  private peek(): string {
    return this.input[this.pos];
  }

  private peekAt(offset: number): string | undefined {
    return this.input[this.pos + offset];
  }

  private advance(): string {
    return this.input[this.pos++];
  }

  private isWhitespace(ch: string): boolean {
    return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
  }

  private isAlpha(ch: string): boolean {
    return /[a-zA-Z_]/.test(ch);
  }

  private isAlphaNumeric(ch: string): boolean {
    return /[a-zA-Z0-9_.\-]/.test(ch);
  }

  private readWhitespace(): void {
    const start = this.pos;
    while (this.pos < this.input.length && this.isWhitespace(this.peek())) {
      this.advance();
    }
    this.tokens.push({
      type: TokenType.WHITESPACE,
      value: this.input.slice(start, this.pos),
      start,
      end: this.pos,
    });
  }

  private readQuotedString(): void {
    const start = this.pos;
    const quote = this.advance(); // consume opening quote
    while (this.pos < this.input.length) {
      const ch = this.advance();
      if (ch === '\\' && this.pos < this.input.length) {
        this.advance(); // skip escaped char
      } else if (ch === quote) {
        break;
      }
    }
    this.tokens.push({
      type: TokenType.QUOTED_VALUE,
      value: this.input.slice(start, this.pos),
      start,
      end: this.pos,
    });
    this.tryReadModifier();
    this.state = LexerState.EXPECT_TERM;
  }

  private readTerm(): void {
    const ch = this.peek();

    if (this.isWhitespace(ch)) {
      this.readWhitespace();
      return;
    }

    if (ch === '"') {
      this.readQuotedString();
      return;
    }

    if (ch === '(') {
      this.tokens.push({ type: TokenType.LPAREN, value: '(', start: this.pos, end: this.pos + 1 });
      this.advance();
      return;
    }

    if (ch === ')') {
      this.tokens.push({ type: TokenType.RPAREN, value: ')', start: this.pos, end: this.pos + 1 });
      this.advance();
      return;
    }

    // Standalone tilde/caret at start of term (e.g. after RPAREN)
    if (ch === '~' || ch === '^') {
      const start = this.pos;
      const type = ch === '~' ? TokenType.TILDE : TokenType.BOOST;
      this.advance();
      while (this.pos < this.input.length && /[0-9.]/.test(this.peek())) {
        this.advance();
      }
      this.tokens.push({ type, value: this.input.slice(start, this.pos), start, end: this.pos });
      return;
    }

    // Range syntax: [start TO end] or {start TO end}
    if (ch === '[' || ch === '{') {
      this.readRangeValue();
      return;
    }

    if (ch === '#') {
      this.readSavedSearch();
      return;
    }

    if (ch === '!') {
      this.readHistoryRef();
      return;
    }

    // Unary prefix operators: - or + before a term
    if ((ch === '-' || ch === '+') && this.pos + 1 < this.input.length) {
      const next = this.peekAt(1);
      if (next && (this.isAlpha(next) || next === '"' || next === '(' || next === '#' || next === '!')) {
        this.tokens.push({
          type: TokenType.PREFIX_OP,
          value: ch,
          start: this.pos,
          end: this.pos + 1,
        });
        this.advance();
        return;
      }
    }

    // && and || as boolean operator aliases
    if (ch === '&' && this.peekAt(1) === '&') {
      this.tokens.push({ type: TokenType.AND, value: '&&', start: this.pos, end: this.pos + 2 });
      this.advance();
      this.advance();
      return;
    }

    if (ch === '|' && this.peekAt(1) === '|') {
      this.tokens.push({ type: TokenType.OR, value: '||', start: this.pos, end: this.pos + 2 });
      this.advance();
      this.advance();
      return;
    }

    // Comparison operators
    if ((ch === '>' || ch === '<') && this.state === LexerState.EXPECT_TERM) {
      const start = this.pos;
      this.advance();
      if (this.pos < this.input.length && this.peek() === '=') {
        this.advance();
      }
      this.tokens.push({
        type: TokenType.COMPARISON_OP,
        value: this.input.slice(start, this.pos),
        start,
        end: this.pos,
      });
      this.state = LexerState.EXPECT_VALUE;
      return;
    }

    // Regex literal: /pattern/
    if (ch === '/') {
      this.readRegex();
      return;
    }

    // Read a word
    const start = this.pos;
    while (this.pos < this.input.length && !this.isWhitespace(this.peek()) &&
           this.peek() !== '(' && this.peek() !== ')' && this.peek() !== '"' &&
           this.peek() !== '~' && this.peek() !== '^' &&
           !(this.peek() === '&' && this.peekAt(1) === '&') &&
           !(this.peek() === '|' && this.peekAt(1) === '|')) {
      // Backslash escaping: consume escaped pair as literal
      if (this.peek() === '\\' && this.pos + 1 < this.input.length) {
        this.advance(); // consume backslash
        this.advance(); // consume escaped char
        continue;
      }
      if (this.peek() === ':') {
        // Everything before colon is field name
        if (this.pos > start) {
          this.tokens.push({
            type: TokenType.FIELD_NAME,
            value: this.input.slice(start, this.pos),
            start,
            end: this.pos,
          });
        }
        this.tokens.push({ type: TokenType.COLON, value: ':', start: this.pos, end: this.pos + 1 });
        this.advance();
        this.state = LexerState.EXPECT_VALUE;
        return;
      }
      this.advance();
    }

    if (this.pos > start) {
      const word = this.input.slice(start, this.pos);
      const upper = word.toUpperCase();

      if (upper === 'AND') {
        this.tokens.push({ type: TokenType.AND, value: word, start, end: this.pos });
      } else if (upper === 'OR') {
        this.tokens.push({ type: TokenType.OR, value: word, start, end: this.pos });
      } else if (upper === 'NOT') {
        this.tokens.push({ type: TokenType.NOT, value: word, start, end: this.pos });
      } else if (word.includes('*') || word.includes('?')) {
        this.tokens.push({ type: TokenType.WILDCARD, value: word, start, end: this.pos });
      } else {
        this.tokens.push({ type: TokenType.VALUE, value: word, start, end: this.pos });
      }
      this.tryReadModifier();
    }
  }

  private readValue(): void {
    const ch = this.peek();

    if (this.isWhitespace(ch)) {
      this.readWhitespace();
      this.state = LexerState.EXPECT_TERM;
      return;
    }

    if (ch === '"') {
      this.readQuotedString();
      this.state = LexerState.EXPECT_TERM;
      return;
    }

    if (ch === '(' || ch === ')') {
      this.state = LexerState.EXPECT_TERM;
      this.readTerm();
      return;
    }

    // Comparison operators before value
    if (ch === '>' || ch === '<') {
      const start = this.pos;
      this.advance();
      if (this.pos < this.input.length && this.peek() === '=') {
        this.advance();
      }
      this.tokens.push({
        type: TokenType.COMPARISON_OP,
        value: this.input.slice(start, this.pos),
        start,
        end: this.pos,
      });
      return; // stay in EXPECT_VALUE
    }

    // Range syntax: [start TO end] or {start TO end}
    if (ch === '[' || ch === '{') {
      this.readRangeValue();
      return;
    }

    // Regex literal: /pattern/
    if (ch === '/') {
      this.readRegex();
      this.state = LexerState.EXPECT_TERM;
      return;
    }

    // Read value word
    const start = this.pos;
    while (this.pos < this.input.length && !this.isWhitespace(this.peek()) &&
           this.peek() !== ')' && this.peek() !== '(' && this.peek() !== '"' &&
           this.peek() !== '~' && this.peek() !== '^') {
      // Backslash escaping: consume escaped pair as literal
      if (this.peek() === '\\' && this.pos + 1 < this.input.length) {
        this.advance(); // consume backslash
        this.advance(); // consume escaped char
        continue;
      }
      this.advance();
    }

    if (this.pos > start) {
      const word = this.input.slice(start, this.pos);
      if (word.includes('*') || word.includes('?')) {
        this.tokens.push({ type: TokenType.WILDCARD, value: word, start, end: this.pos });
      } else {
        this.tokens.push({ type: TokenType.VALUE, value: word, start, end: this.pos });
      }
      this.tryReadModifier();
    }

    this.state = LexerState.EXPECT_TERM;
  }

  private readRangeValue(): void {
    const start = this.pos;
    this.advance(); // consume [ or {

    // Consume everything until any close bracket (] or }) or end of input
    while (this.pos < this.input.length && this.peek() !== ']' && this.peek() !== '}') {
      this.advance();
    }

    // Consume close bracket if present
    if (this.pos < this.input.length && (this.peek() === ']' || this.peek() === '}')) {
      this.advance();
    }

    this.tokens.push({
      type: TokenType.VALUE,
      value: this.input.slice(start, this.pos),
      start,
      end: this.pos,
    });

    this.state = LexerState.EXPECT_TERM;
  }

  private tryReadModifier(): void {
    // After emitting a value/quoted/wildcard token, check for ~ or ^
    while (this.pos < this.input.length && (this.peek() === '~' || this.peek() === '^')) {
      const start = this.pos;
      const ch = this.advance(); // consume ~ or ^
      const type = ch === '~' ? TokenType.TILDE : TokenType.BOOST;
      // consume optional digits and decimal point (for boost like ^1.5)
      while (this.pos < this.input.length && /[0-9.]/.test(this.peek())) {
        this.advance();
      }
      this.tokens.push({
        type,
        value: this.input.slice(start, this.pos),
        start,
        end: this.pos,
      });
    }
  }

  private readRegex(): void {
    const start = this.pos;
    this.advance(); // consume opening /
    while (this.pos < this.input.length) {
      const ch = this.peek();
      if (ch === '\\' && this.pos + 1 < this.input.length) {
        this.advance(); // consume backslash
        this.advance(); // consume escaped char
        continue;
      }
      if (ch === '/') {
        this.advance(); // consume closing /
        this.tokens.push({
          type: TokenType.REGEX,
          value: this.input.slice(start, this.pos),
          start,
          end: this.pos,
        });
        this.tryReadModifier();
        this.state = LexerState.EXPECT_TERM;
        return;
      }
      this.advance();
    }
    // Unclosed regex — emit as VALUE fallback
    this.tokens.push({
      type: TokenType.VALUE,
      value: this.input.slice(start, this.pos),
      start,
      end: this.pos,
    });
    this.state = LexerState.EXPECT_TERM;
  }

  private readSavedSearch(): void {
    const start = this.pos;
    this.advance(); // consume #
    while (this.pos < this.input.length && this.isAlphaNumeric(this.peek())) {
      this.advance();
    }
    this.tokens.push({
      type: TokenType.SAVED_SEARCH,
      value: this.input.slice(start, this.pos),
      start,
      end: this.pos,
    });
  }

  private readHistoryRef(): void {
    const start = this.pos;
    this.advance(); // consume !
    while (this.pos < this.input.length && this.isAlphaNumeric(this.peek())) {
      this.advance();
    }
    this.tokens.push({
      type: TokenType.HISTORY_REF,
      value: this.input.slice(start, this.pos),
      start,
      end: this.pos,
    });
  }
}
