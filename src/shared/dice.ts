import type { DegreeOfSuccess, DiceTerm, RollResult } from "./types";

type Rng = () => number;

interface EvalContext {
  rng: Rng;
  terms: DiceTerm[];
  constants: { value: number; sign: 1 | -1 }[];
  d20: number | null;
}

type Node =
  | { kind: "number"; value: number }
  | {
      kind: "dice";
      count: number;
      sides: number;
      keep: { mode: "kh" | "kl"; n: number } | null;
      sign: 1 | -1;
    }
  | { kind: "unary"; sign: 1 | -1; node: Node }
  | { kind: "binary"; op: "+" | "-" | "*"; left: Node; right: Node };

// ---------------------------------------------------------------------------
// Tokenizer / parser
// ---------------------------------------------------------------------------
interface Token {
  type: "number" | "dice" | "op" | "lparen" | "rparen";
  value: string;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  const text = input.replace(/\s+/g, "");
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    const dice = rest.match(/^(\d{0,3})d(\d{1,4})(?:(kh|kl)(\d{1,3}))?/i);
    if (dice) {
      const raw = dice[0];
      const count = Number(dice[1] || 1);
      const sides = Number(dice[2]);
      const keep = dice[3]
        ? { mode: dice[3].toLowerCase() as "kh" | "kl", n: Number(dice[4]) }
        : null;
      if (count < 1 || count > 100) throw new Error("Dice count must be between 1 and 100.");
      if (sides < 2 || sides > 1000) throw new Error("Dice sides must be between 2 and 1000.");
      tokens.push({ type: "dice", value: JSON.stringify({ count, sides, keep }) });
      i += raw.length;
      continue;
    }
    const number = rest.match(/^\d+/);
    if (number) {
      tokens.push({ type: "number", value: number[0] });
      i += number[0].length;
      continue;
    }
    const char = text[i];
    if (["+", "-", "*"].includes(char)) {
      tokens.push({ type: "op", value: char });
      i += 1;
      continue;
    }
    if (char === "(") {
      tokens.push({ type: "lparen", value: char });
      i += 1;
      continue;
    }
    if (char === ")") {
      tokens.push({ type: "rparen", value: char });
      i += 1;
      continue;
    }
    throw new Error(`Unexpected character "${char}" in dice formula.`);
  }
  return tokens;
}

class Parser {
  private index = 0;
  constructor(private tokens: Token[]) {}

  parse(): Node {
    if (!this.tokens.length) throw new Error("Enter a dice formula, e.g. 1d20+7.");
    const node = this.parseExpression();
    if (this.index < this.tokens.length) throw new Error("Unexpected input in dice formula.");
    return node;
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private parseExpression(): Node {
    let left = this.parseTerm();
    while (this.peek()?.type === "op" && ["+", "-"].includes(this.peek()!.value)) {
      const op = this.tokens[this.index++].value as "+" | "-";
      const right = this.parseTerm();
      left = { kind: "binary", op, left, right };
    }
    return left;
  }

  private parseTerm(): Node {
    let left = this.parseUnary();
    while (this.peek()?.type === "op" && this.peek()!.value === "*") {
      this.index++;
      const right = this.parseUnary();
      left = { kind: "binary", op: "*", left, right };
    }
    return left;
  }

  private parseUnary(): Node {
    const token = this.peek();
    if (!token) throw new Error("Incomplete dice formula.");
    if (token.type === "op" && (token.value === "+" || token.value === "-")) {
      this.index++;
      return { kind: "unary", sign: token.value === "-" ? -1 : 1, node: this.parseUnary() };
    }
    if (token.type === "lparen") {
      this.index++;
      const node = this.parseExpression();
      if (this.peek()?.type !== "rparen") throw new Error("Missing closing parenthesis.");
      this.index++;
      return node;
    }
    if (token.type === "number") {
      this.index++;
      return { kind: "number", value: Number(token.value) };
    }
    if (token.type === "dice") {
      this.index++;
      const parsed = JSON.parse(token.value) as {
        count: number;
        sides: number;
        keep: { mode: "kh" | "kl"; n: number } | null;
      };
      return { kind: "dice", ...parsed, sign: 1 };
    }
    throw new Error("Expected a number, die, or parenthesis.");
  }
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------
function rollDie(sides: number, rng: Rng): number {
  return Math.floor(rng() * sides) + 1;
}

function evaluate(node: Node, ctx: EvalContext): number {
  switch (node.kind) {
    case "number":
      ctx.constants.push({ value: node.value, sign: 1 });
      return node.value;
    case "unary": {
      const value = evaluate(node.node, ctx);
      if (node.sign === -1) ctx.constants.push({ value: Math.abs(value), sign: -1 });
      return value * node.sign;
    }
    case "dice": {
      const results: number[] = [];
      for (let i = 0; i < node.count; i++) results.push(rollDie(node.sides, ctx.rng));
      let kept = [...results];
      if (node.keep) {
        const sorted = [...results].sort((a, b) => (node.keep!.mode === "kh" ? b - a : a - b));
        const keepSet = sorted.slice(0, Math.min(node.keep.n, results.length));
        kept = results.filter((value) => {
          const idx = keepSet.indexOf(value);
          if (idx >= 0) {
            keepSet.splice(idx, 1);
            return true;
          }
          return false;
        });
      }
      const subtotal = kept.reduce((sum, value) => sum + value, 0);
      ctx.terms.push({
        type: "dice",
        count: node.count,
        sides: node.sides,
        results,
        kept,
        subtotal,
      });
      if (node.sides === 20 && ctx.d20 === null && kept.length) ctx.d20 = kept[0];
      return subtotal;
    }
    case "binary": {
      const left = evaluate(node.left, ctx);
      const right = evaluate(node.right, ctx);
      if (node.op === "+") return left + right;
      if (node.op === "-") return left - right;
      return left * right;
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export function getDegreeOfSuccess(total: number, dc: number, d20: number | null): DegreeOfSuccess {
  let level = 0; // 0 crit fail, 1 fail, 2 success, 3 crit success
  if (total >= dc + 10) level = 3;
  else if (total >= dc) level = 2;
  else if (total > dc - 10) level = 1;
  else level = 0;
  if (d20 === 20) level = Math.min(3, level + 1);
  if (d20 === 1) level = Math.max(0, level - 1);
  return level === 3
    ? "critical-success"
    : level === 2
      ? "success"
      : level === 1
        ? "failure"
        : "critical-failure";
}

export const DEGREE_LABELS: Record<DegreeOfSuccess, string> = {
  "critical-success": "Critical Success",
  success: "Success",
  failure: "Failure",
  "critical-failure": "Critical Failure",
};

export function describeRoll(result: RollResult): string {
  const parts: string[] = [];
  for (const term of result.terms) {
    const rolls = term.results.join(", ");
    const kept = term.kept.length !== term.results.length ? ` → keep ${term.kept.join(", ")}` : "";
    parts.push(`${term.count}d${term.sides} (${rolls}${kept})`);
  }
  for (const constant of result.constants) {
    if (constant.value === 0) continue;
    parts.push(`${constant.sign === -1 ? "−" : "+"} ${constant.value}`);
  }
  return parts.join(" ");
}

/**
 * Apply a multiple-attack penalty to a standard d20 attack formula. Any
 * trailing text after the flat bonus is preserved.
 */
export function applyAttackPenalty(formula: string, penalty: number): string {
  const text = formula.trim();
  const match = text.match(/^(\d*d20)([+-]\d+)?(.*)$/i);
  if (!match) return text;
  const bonus = Number(match[2] ?? 0) - Math.max(0, Math.round(penalty));
  return `${match[1]}${bonus >= 0 ? "+" : ""}${bonus}${match[3] ?? ""}`;
}

export function rollFormula(
  formula: string,
  options: { dc?: number | null; label?: string; rng?: Rng } = {}
): RollResult {
  const clean = String(formula || "").trim();
  if (!clean) throw new Error("Enter a dice formula, e.g. 1d20+7.");
  if (clean.length > 300) throw new Error("Dice formula is too long.");
  const ast = new Parser(tokenize(clean)).parse();
  const ctx: EvalContext = {
    rng: options.rng ?? Math.random,
    terms: [],
    constants: [],
    d20: null,
  };
  const total = evaluate(ast, ctx);
  const dc = typeof options.dc === "number" && Number.isFinite(options.dc) ? options.dc : null;
  const degree = dc !== null && ctx.d20 !== null ? getDegreeOfSuccess(total, dc, ctx.d20) : null;
  return {
    formula: clean,
    total,
    terms: ctx.terms,
    constants: ctx.constants,
    breakdown: describeRoll({
      formula: clean,
      total,
      terms: ctx.terms,
      constants: ctx.constants,
      breakdown: "",
      d20: ctx.d20,
      dc,
      degree,
      label: options.label ?? "",
    }),
    d20: ctx.d20,
    dc,
    degree,
    label: options.label ?? "",
  };
}

export function validateFormula(formula: string): { ok: boolean; error?: string } {
  try {
    const ast = new Parser(tokenize(formula)).parse();
    if (!ast) return { ok: false, error: "Enter a formula." };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid formula." };
  }
}

export function mod(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

export function signed(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}
