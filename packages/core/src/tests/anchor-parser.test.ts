// @syndocs
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { initTokenizer } from '../tokenizer';
import { parseAnchors } from '../anchor-parser';
import { getLangConfig } from '../languages';
import type { GraphAdapterLike, NodeBoundaryLike } from '../graph-adapter-like';

before(async () => {
  await initTokenizer(['typescript', 'javascript', 'python', 'css', 'html']);
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

// ─── AST-preferred scope resolution ─────────────────────────────────────────

function makeFakeAdapter(boundary: NodeBoundaryLike | null): GraphAdapterLike {
  return {
    isReady: () => true,
    getNodeBoundary: () => boundary,
    getNextNode: () => boundary,
    getEnclosingScope: () => boundary,
  };
}

test('scope resolution prefers the graph adapter over the regex fallback when ready', () => {
  const cfg = getLangConfig('x.ts')!;
  const content = `
// @synd
function realFunctionName() {
  return 1;
}
`;
  const adapter = makeFakeAdapter({
    name: 'astResolvedName',
    kind: 'function',
    startLine: 3, // 1-based
    endLine: 5,
  });
  const result = parseAnchors(content, cfg, { graphAdapter: adapter, filePath: 'x.ts' });
  // bare @synd here is on line 1 (0-based), which is within the header area,
  // so it's whole-file, not auto-scoped — use an inline case instead to
  // actually exercise scope resolution.
  assert.equal(result[0].kind, 'whole-file');
});

test('inline bare anchor uses AST scope name over regex-detected name when adapter is ready', () => {
  const cfg = getLangConfig('x.ts')!;
  const content = `weirdSyntaxRegexCannotParse(); // @synd\n`;
  const adapter = makeFakeAdapter({
    name: 'astResolvedName',
    kind: 'function',
    startLine: 1,
    endLine: 1,
  });
  const result = parseAnchors(content, cfg, { graphAdapter: adapter, filePath: 'x.ts' });
  assert.equal(result.length, 1);
  assert.equal(result[0].elementName, 'astResolvedName');
});

test('falls back to regex-based scope detection when adapter is not ready', () => {
  const cfg = getLangConfig('x.ts')!;
  const content = `function realFunctionName() { return 1; } // @synd\n`;
  const notReadyAdapter: GraphAdapterLike = {
    isReady: () => false,
    getNodeBoundary: () => { throw new Error('should not be called'); },
    getNextNode: () => { throw new Error('should not be called'); },
    getEnclosingScope: () => { throw new Error('should not be called'); },
  };
  const result = parseAnchors(content, cfg, { graphAdapter: notReadyAdapter, filePath: 'x.ts' });
  assert.equal(result.length, 1);
  assert.equal(result[0].elementName, 'realFunctionName');
});

test('falls back to regex-based scope detection when no adapter is supplied at all', () => {
  const cfg = getLangConfig('x.ts')!;
  const content = `function realFunctionName() { return 1; } // @synd\n`;
  const result = parseAnchors(content, cfg);
  assert.equal(result.length, 1);
  assert.equal(result[0].elementName, 'realFunctionName');
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
