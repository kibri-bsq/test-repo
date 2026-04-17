export type TokenType =
  | "IDENT" | "NUMBER" | "PLUS" | "MINUS" | "STAR" | "SLASH"
  | "LPAREN" | "RPAREN" | "LBRACKET" | "RBRACKET" | "COMMA" | "EQUALS";

export interface Token { type: TokenType; value: string; }
export type ContextOverride = {
  dimensionId: string;
  value: string | "current" | "parent" | "previous" | "next";
};
export type AstNode =
  | { kind: "numberLiteral"; value: number }
  | { kind: "identifier"; name: string }
  | { kind: "contextualReference"; name: string; overrides: ContextOverride[] }
  | { kind: "binaryOperation"; operator: "+" | "-" | "*" | "/"; left: AstNode; right: AstNode }
  | { kind: "functionCall"; functionName: string; args: AstNode[] };

const TOKEN_REGEX = /\s*([A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|\+|\-|\*|\/|\(|\)|\[|\]|,|=)\s*/gy;

function mapToken(value: string): Token {
  switch (value) {
    case "+": return { type: "PLUS", value };
    case "-": return { type: "MINUS", value };
    case "*": return { type: "STAR", value };
    case "/": return { type: "SLASH", value };
    case "(": return { type: "LPAREN", value };
    case ")": return { type: "RPAREN", value };
    case "[": return { type: "LBRACKET", value };
    case "]": return { type: "RBRACKET", value };
    case ",": return { type: "COMMA", value };
    case "=": return { type: "EQUALS", value };
    default:
      if (!Number.isNaN(Number(value))) return { type: "NUMBER", value };
      return { type: "IDENT", value };
  }
}

export function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  TOKEN_REGEX.lastIndex = 0;
  let cursor = 0;
  while (cursor < formula.length) {
    const match = TOKEN_REGEX.exec(formula);
    if (!match) throw new Error(`Unexpected token near: "${formula.slice(cursor)}"`);
    tokens.push(mapToken(match[1]));
    cursor = TOKEN_REGEX.lastIndex;
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}
  parse(): AstNode {
    const expr = this.parseExpression();
    if (this.pos < this.tokens.length) throw new Error(`Unexpected token: ${this.tokens[this.pos].value}`);
    return expr;
  }
  private current(): Token | undefined { return this.tokens[this.pos]; }
  private consume(type?: TokenType): Token {
    const token = this.tokens[this.pos];
    if (!token) throw new Error("Unexpected end of formula");
    if (type && token.type !== type) throw new Error(`Expected ${type} but found ${token.type}`);
    this.pos++;
    return token;
  }
  private parseExpression(): AstNode {
    let node = this.parseTerm();
    while (this.current()?.type === "PLUS" || this.current()?.type === "MINUS") {
      const op = this.consume().value as "+" | "-";
      const right = this.parseTerm();
      node = { kind: "binaryOperation", operator: op, left: node, right };
    }
    return node;
  }
  private parseTerm(): AstNode {
    let node = this.parseFactor();
    while (this.current()?.type === "STAR" || this.current()?.type === "SLASH") {
      const op = this.consume().value as "*" | "/";
      const right = this.parseFactor();
      node = { kind: "binaryOperation", operator: op, left: node, right };
    }
    return node;
  }
  private parseFactor(): AstNode {
    const token = this.current();
    if (!token) throw new Error("Unexpected end of formula");
    if (token.type === "NUMBER") {
      this.consume("NUMBER");
      return { kind: "numberLiteral", value: Number(token.value) };
    }
    if (token.type === "IDENT") return this.parseIdentifierLike();
    if (token.type === "LPAREN") {
      this.consume("LPAREN");
      const expr = this.parseExpression();
      this.consume("RPAREN");
      return expr;
    }
    throw new Error(`Unexpected token: ${token.value}`);
  }
  private parseIdentifierLike(): AstNode {
    const ident = this.consume("IDENT").value;
    if (this.current()?.type === "LPAREN") {
      this.consume("LPAREN");
      const args: AstNode[] = [];
      if (this.current()?.type !== "RPAREN") {
        args.push(this.parseExpression());
        while (this.current()?.type === "COMMA") {
          this.consume("COMMA");
          args.push(this.parseExpression());
        }
      }
      this.consume("RPAREN");
      return { kind: "functionCall", functionName: ident, args };
    }
    if (this.current()?.type === "LBRACKET") {
      this.consume("LBRACKET");
      const overrides: ContextOverride[] = [];
      while (this.current()?.type !== "RBRACKET") {
        const dimensionId = this.consume("IDENT").value;
        this.consume("EQUALS");
        const raw = this.consume("IDENT").value;
        overrides.push({ dimensionId, value: raw as ContextOverride["value"] });
        if (this.current()?.type === "COMMA") this.consume("COMMA");
      }
      this.consume("RBRACKET");
      return { kind: "contextualReference", name: ident, overrides };
    }
    return { kind: "identifier", name: ident };
  }
}

export function parseFormula(formula: string): AstNode {
  return new Parser(tokenize(formula)).parse();
}
