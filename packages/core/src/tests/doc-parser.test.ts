// @syndocs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMirrorDoc } from '../doc-parser';

// ─── Bug: extractNotes never found "## Notes" after a single code block ────
//
// The original fence-depth tracker incremented codeDepth on *every* line
// matching /^```/ — including the closing fence itself — then also
// decremented on that same line, for a net change of -1 instead of the
// intended "open (+1), close (-1) => 0". codeDepth therefore got stuck at 1
// after the first (and typically only) code block, `pastCode` never became
// true, and saved notes were silently discarded on every re-parse (i.e. on
// every server rebuild after a save — the exact "notes save but don't show
// up" bug this test guards against).

test('parseMirrorDoc extracts notes after a single whole-file code block', () => {
  const content = [
    '# example.ts',
    '<!-- syndocs-hash: abc123 -->',
    '',
    '```ts',
    'export function example() {',
    '  return 1;',
    '}',
    '```',
    '',
    '## Notes',
    '',
    'This is a saved note that must survive a re-parse.',
    '',
  ].join('\n');

  const doc = parseMirrorDoc(content);
  const section = doc.sections.find(s => s.kind === 'whole-file');
  assert.ok(section, 'expected a whole-file section');
  assert.equal(section!.notes, 'This is a saved note that must survive a re-parse.');
  // Code extraction must keep working too (shares the same lines array).
  assert.match(section!.codeCopy ?? '', /export function example/);
});

test('parseMirrorDoc extracts notes for a micro-doc (annotation) section', () => {
  const content = [
    '# example.ts',
    '<!-- syndocs-hash: abc123 -->',
    '',
    '```ts',
    'export function example() {}',
    '```',
    '',
    '## Notes',
    '',
    '(no notes for the whole file)',
    '',
    '---',
    '## @syndocs: my-label',
    '<!-- syndocs-hash: def456 -->',
    '',
    '```ts',
    'function inner() {}',
    '```',
    '',
    '## Notes',
    '',
    'Annotation-level note text.',
    '',
  ].join('\n');

  const doc = parseMirrorDoc(content);
  const micro = doc.sections.find(s => s.kind === 'micro' && s.label === 'my-label');
  assert.ok(micro, 'expected a micro-doc section with label my-label');
  assert.equal(micro!.notes, 'Annotation-level note text.');
});

test('parseMirrorDoc returns empty notes when no "## Notes" heading is present', () => {
  const content = ['# example.ts', '<!-- syndocs-hash: abc123 -->', '', '```ts', 'const x = 1;', '```', ''].join('\n');
  const doc = parseMirrorDoc(content);
  const section = doc.sections.find(s => s.kind === 'whole-file');
  assert.equal(section!.notes, '');
});
