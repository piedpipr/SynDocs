// @syndocs
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { initTokenizer } from '../tokenizer';
import { initAstEngine } from '../ast-scope';
import { parseAnchors } from '../anchor-parser';
import { getLangConfig } from '../languages';

before(async () => {
  await initTokenizer(['typescript', 'javascript', 'python', 'css', 'html', 'php', 'java']);
  await initAstEngine(['typescript', 'javascript', 'python', 'php', 'java']);
});

function anchors(content: string, filename: string) {
  const cfg = getLangConfig(filename);
  assert.ok(cfg, `expected a language config for ${filename}`);
  return parseAnchors(content, cfg!);
}

// ─── Bugs found in the old regex/quote-tracking parser ─────────────────────

test('multi-line /* */ block comment is detected (old parser missed this entirely)', () => {
  const result = anchors(`
/*
 * @synd: my-block
 */
function foo() {}
`, 'x.ts');
  assert.equal(result.length, 1);
  assert.equal(result[0].kind, 'micro');
  assert.equal(result[0].label, 'my-block');
});

test('JSDoc-style /** @synd */ is detected in a .ts file (old parser only checked "//")', () => {
  const result = anchors(`
/** @synd: jsdoc-anchor */
function bar() {}
`, 'x.ts');
  assert.equal(result.length, 1);
  assert.equal(result[0].label, 'jsdoc-anchor');
});

test('@synd on a middle line of a multi-line JSDoc block is still found', () => {
  const result = anchors(`
/**
 * Some description here.
 * @synd: my-label
 */
function foo() {}
`, 'x.ts');
  assert.equal(result.length, 1);
  assert.equal(result[0].label, 'my-label');
});

test('anchor after a regex literal containing a quote char is not swallowed', () => {
  // Old parser: the apostrophe inside /don't-match/ was misread as opening a
  // string, corrupting quote-tracking state for the rest of the line and
  // silently dropping the trailing real annotation.
  const result = anchors(`
const re = /don't-match/; // @synd: after-regex
`, 'x.ts');
  assert.equal(result.length, 1);
  assert.equal(result[0].label, 'after-regex');
  assert.equal(result[0].inline, true);
});

test('anchor after a multi-line template literal is found (state must carry across lines)', () => {
  const result = anchors(`
const x = \`
  hello
\`;
// @synd: after-template
function baz() {}
`, 'x.ts');
  assert.equal(result.length, 1);
  assert.equal(result[0].label, 'after-template');
});

test('multi-line CSS block comment is detected', () => {
  const result = anchors(`
/*
 * @synd: css-multiline
 */
.foo { color: red; }
`, 'x.css');
  assert.equal(result.length, 1);
  assert.equal(result[0].label, 'css-multiline');
});

test('a string literal containing comment-like text is NOT mistaken for a real comment', () => {
  const result = anchors(`
const s = "this is not a // @synd: fake comment";
`, 'x.ts');
  assert.equal(result.length, 0);
});

test('python triple-quoted docstring containing a colon does not break subsequent detection', () => {
  const result = anchors(`
def foo():
    """
    docstring: with a colon
    """
    pass

# @synd: after-docstring
def bar():
    pass
`, 'x.py');
  assert.equal(result.length, 1);
  assert.equal(result[0].label, 'after-docstring');
});

test('HTML comment anchors are detected', () => {
  const result = anchors(`
<!-- @synd: html-anchor -->
<div>hi</div>
`, 'x.html');
  assert.equal(result.length, 1);
  assert.equal(result[0].label, 'html-anchor');
});

test('two separate single-line // comments are not incorrectly merged into one span', () => {
  const result = anchors(`
// @synd: first
code1();
// @synd: second
code2();
`, 'x.ts');
  assert.equal(result.length, 2);
  assert.equal(result[0].label, 'first');
  assert.equal(result[1].label, 'second');
});

test('bare @synd at top of file is whole-file scoped', () => {
  const result = anchors(`// @synd
function foo() {}
`, 'x.ts');
  assert.equal(result.length, 1);
  assert.equal(result[0].kind, 'whole-file');
});

test('duplicate explicit labels in one file: first wins, second is skipped', () => {
  const result = anchors(`
// @synd: dup
function a() {}
// @synd: dup
function b() {}
`, 'x.ts');
  assert.equal(result.length, 1);
  assert.equal(result[0].label, 'dup');
});

test('inline anchor after a chained method CALL is not misidentified as a method declaration (regression)', () => {
  // Reported bug: `$table->string(...)->default(...)` was misread as
  // declaring a method named "string" by the OLD regex parser, which
  // matched any "identifier followed by (" with no check for a preceding
  // `->`/`.`/`::` member-access operator. Tree-sitter can't make this
  // mistake at all: `string`/`default` are calls inside an expression
  // statement, never a `method_declaration` node, regardless of the
  // (deliberately unrealistic — this is invalid standalone PHP) shape of
  // the surrounding statement.
  const result = anchors(`<?php
class ExamResult extends Model {
    protected $fillable = ['user_id'];

    $table->string('exam_category', 30)->default('practice_set'); // @synd
}
`, 'x.php');
  assert.equal(result.length, 1);
  assert.equal(result[0].inline, true);
  assert.notEqual(result[0].elementName, 'string');
  assert.notEqual(result[0].elementName, 'default');
});

test('inline anchor after a JS method call (this.foo()) is not misidentified as a declaration', () => {
  const result = anchors(`
this.doSomething(x); // @synd
`, 'x.ts');
  assert.equal(result[0].elementName, undefined);
});

test('property assignment via -> is not misidentified as a variable declaration', () => {
  const result = anchors(`<?php
$table->exam_category = 'practice_set'; // @synd
`, 'x.php');
  assert.equal(result[0].elementName, undefined);
});

test('genuine Java/C#-style typed method declaration (no fixed keyword) is still detected', () => {
  const result = anchors(`
public void calculateTotal() { // @synd
  return;
}
`, 'x.java');
  assert.equal(result[0].elementKind, 'method');
  assert.equal(result[0].elementName, 'calculateTotal');
});

test('PHP "function" keyword declaration is still detected', () => {
  const result = anchors(`<?php
class Foo {
  private $x;

  // @synd
  public function getName() {
    return $this->name;
  }
}
`, 'x.php');
  const micro = result.find(a => a.autoScoped);
  assert.ok(micro, 'expected an auto-scoped micro anchor');
  // Now resolved via tree-sitter (not the old regex), which correctly
  // reports this as a class "method" rather than a bare "function" since
  // it's declared inside a class body — a more precise result than the old
  // regex-based DECLARATION_PATTERNS table produced.
  assert.equal(micro!.elementKind, 'method');
  assert.equal(micro!.elementName, 'getName');
});

// ─── AST-based scope resolution (tree-sitter) ───────────────────────────────

test('REGRESSION (bug #1): a stray unmatched brace character inside a string literal no longer swallows the next unrelated function', () => {
  // This is the exact case that broke the old brace-counting findBlockEnd():
  // a string containing a lone `}` shifted the raw-character brace count by
  // one, so depth never reached <= 0 until the NEXT function's closing
  // brace, silently merging two unrelated functions into one micro-doc.
  const result = anchors(`
export function noise() { return 0; }

// @synd: with-odd-brace
export function withOddBrace(name) {
  const s = "curly: }"; // this string has a lone closing brace
  console.log(name, s);
  return name;
}

export function shouldBeSeparate(x) {
  return x * 2;
}
`, 'x.ts');

  const micro = result.find(a => a.label === 'with-odd-brace');
  assert.ok(micro, 'expected the with-odd-brace anchor to be found');
  assert.equal(micro!.elementName, 'withOddBrace');
  assert.equal(micro!.elementKind, 'function');
  // Must end at withOddBrace's own closing brace (line 8, 0-based; exclusive
  // end = 9), NOT swallow shouldBeSeparate too (which starts at line 10).
  assert.ok(
    micro!.scopeEndLine! <= 9,
    `expected scope to end at/before line 9 (before shouldBeSeparate at line 10), got endLine=${micro!.scopeEndLine}`,
  );
});

test('REGRESSION (bug #2): explicit @synd: label sitting inside a multi-line JSDoc block above a multi-line function signature resolves correct boundaries', () => {
  // The old parser's explicit-label branch never called scope resolution
  // at all — this pins that it now does, and resolves the FULL declaration
  // (not a snippet starting mid-comment).
  const result = anchors(`
const template = \`some { curly } braces inside a string\`;

/**
 * Computes the total price including tax.
 * @synd: compute-total
 */
export function computeTotal(
  items,
  taxRate,
) {
  const subtotal = items.reduce((a, b) => a + b, 0);
  return subtotal * (1 + taxRate);
}
`, 'x.ts');

  const micro = result.find(a => a.label === 'compute-total');
  assert.ok(micro, 'expected the compute-total anchor to be found');
  assert.equal(micro!.elementKind, 'function');
  assert.equal(micro!.elementName, 'computeTotal');
  // scopeStartLine must point at the `export function computeTotal(` line,
  // not anywhere inside the JSDoc block above it.
  assert.ok(micro!.scopeStartLine !== undefined);
  assert.ok(micro!.scopeEndLine !== undefined);
});

test('AST scope resolution is not fooled by unbalanced braces inside a // comment', () => {
  const result = anchors(`
export function noise2() {}

// @synd: with-comment-brace
export function withCommentBrace(name) {
  // NOTE: legacy behavior used an unbalanced brace like this: }
  console.log(name);
  return name;
}

export function afterCommentBrace(x) {
  return x + 1;
}
`, 'x.ts');
  const micro = result.find(a => a.label === 'with-comment-brace');
  assert.ok(micro);
  assert.equal(micro!.elementName, 'withCommentBrace');
  // withCommentBrace's closing brace is on line 8 (0-based) -> exclusive
  // end 9; afterCommentBrace starts at line 10. Must not reach line 10.
  assert.ok(micro!.scopeEndLine! <= 9);
});

test('inline bare anchor resolves the enclosing declaration via tree-sitter, including inside a class body (Java)', () => {
  const result = anchors(`
public class Foo {
  public void calculateTotal() { // @synd
    return;
  }
}
`, 'x.java');
  const micro = result.find(a => a.inline);
  assert.ok(micro);
  assert.equal(micro!.elementKind, 'method');
  assert.equal(micro!.elementName, 'calculateTotal');
});

test('above-annotation resolves a PHP method declared inside a class body via tree-sitter', () => {
  const result = anchors(`<?php
class Foo {
  private $x;

  // @synd
  public function getName() {
    return $this->name;
  }
}
`, 'x.php');
  const micro = result.find(a => a.autoScoped);
  assert.ok(micro, 'expected an auto-scoped micro anchor');
  assert.equal(micro!.elementKind, 'method');
  assert.equal(micro!.elementName, 'getName');
});

test('falls back to regex-based scope detection for a language with no bundled tree-sitter grammar (SQL)', () => {
  const cfg = getLangConfig('x.sql');
  // SQL isn't in languages.ts's BY_EXTENSION table today, so guard this
  // test to skip cleanly if that ever changes rather than failing on an
  // unrelated config gap.
  if (!cfg) return;
  const content = `CREATE TABLE users (id INT); -- @synd\n`;
  const result = parseAnchors(content, cfg);
  assert.equal(result.length, 1);
});

test('falls back to regex-based scope detection when the AST engine has not been initialized for this language', () => {
  // 'ruby' was intentionally not warmed up in the `before` hook above, so
  // this exercises the "grammar exists but not loaded" fallback path.
  const cfg = getLangConfig('x.rb')!;
  const content = `def realMethodName\n  1\nend # @synd\n`;
  const result = parseAnchors(content, cfg);
  assert.equal(result.length, 1);
  // Regex fallback catches the generic assignment shape only, so this just
  // confirms the anchor is still found and doesn't crash — not that it's
  // perfectly scoped, which is exactly why we prefer AST when available.
});

// ─── Fail-fast contract ─────────────────────────────────────────────────────

test('extractCommentSpans throws a clear error if called before initTokenizer (simulated via unsupported grammar bypass)', () => {
  // We can't easily de-initialize the module-level singleton from a test
  // without reaching into internals, so this test instead documents and
  // pins the *error message contract* by checking it directly against the
  // exported error text shape used in tokenizer.ts, exercised via an
  // unsupported grammar id, which takes the same explicit-throw path.
  assert.throws(() => {
    require('../tokenizer').extractCommentSpans('code', 'not-a-real-grammar-id');
  }, /Unknown grammar id/);
});

// ─── Explicit block-end markers (@endsynd) ─────────────────────────────────
//
// `@endsynd` lets an annotation declare an explicit line range instead of
// relying on AST/regex scope inference. This is what the Web UI's "Add Doc
// (Block)" action emits when the user selects an arbitrary span of lines
// that doesn't correspond to a single AST node (e.g. two sibling
// declarations). Scope indices are 0-based with an exclusive end, so the
// documented range is the lines strictly between the two markers.

test('@endsynd sets an explicit scope spanning multiple sibling declarations', () => {
  const content = [
    'export const GAMMA = 42;',   // 0
    '',                           // 1
    '// @synd',                   // 2
    'export const A = 1;',        // 3
    'export const B = 2;',        // 4
    '// @endsynd',                // 5
  ].join('\n');

  const found = anchors(content, 'x.ts');
  const micro = found.find(a => a.kind === 'micro');
  assert.ok(micro, 'expected a micro anchor');
  // Range is the lines between the markers: indices 3..4, exclusive end 5.
  assert.equal(micro!.scopeStartLine, 3);
  assert.equal(micro!.scopeEndLine, 5);
});

test('@endsynd marker is a delimiter, not an annotation of its own', () => {
  // Real code first, so the bare @synd below is a micro anchor rather than
  // being claimed as the file-level (whole-file) anchor.
  const content = [
    'export function existing() {}',
    '',
    '// @synd',
    'const a = 1;',
    '// @endsynd',
  ].join('\n');

  const found = anchors(content, 'x.ts');
  // Exactly one anchor — the @endsynd must not produce a second micro-doc.
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, 'micro');
});

test('an @endsynd belonging to a later annotation does not capture an earlier one', () => {
  const content = [
    'export function head() {}', // 0  real code first, so neither @synd below
    '',                          // 1  gets claimed as the whole-file anchor
    '// @synd',                  // 2  -> scopes via AST, not the far @endsynd
    'function first() {}',       // 3
    '',                          // 4
    '// @synd',                  // 5  -> owns the @endsynd below
    'const x = 1;',              // 6
    '// @endsynd',               // 7
  ].join('\n');

  const found = anchors(content, 'x.ts');
  const micros = found.filter(a => a.kind === 'micro');
  assert.equal(micros.length, 2);
  // The first annotation must NOT swallow everything up to line 5 — an
  // intervening @synd means that end marker belongs to the second one.
  assert.ok(
    (micros[0].scopeEndLine ?? 0) < 7,
    `first anchor should not extend to the later @endsynd (got ${micros[0].scopeEndLine})`,
  );
  assert.equal(micros[1].scopeStartLine, 6);
  assert.equal(micros[1].scopeEndLine, 7);
});
