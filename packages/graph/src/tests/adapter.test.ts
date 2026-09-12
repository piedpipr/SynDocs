// @syndocs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { CodeGraphAdapter } from '../adapter';

let projectRoot: string;
let adapter: CodeGraphAdapter | null;

before(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'syndocs-graph-test-'));
  fs.mkdirSync(path.join(projectRoot, '.codegraph'));

  const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
  const db = new DatabaseSync(path.join(projectRoot, '.codegraph', 'codegraph.db'));
  db.exec(`
    CREATE TABLE nodes (id INTEGER PRIMARY KEY, name TEXT, file_path TEXT, kind TEXT);
    CREATE TABLE edges (id INTEGER PRIMARY KEY, source INTEGER, target INTEGER, kind TEXT, line INTEGER, col INTEGER);
  `);
  db.exec(`
    INSERT INTO nodes (id, name, file_path, kind) VALUES
      (1, 'ExamResult',   'src/Models/ExamResult.php', 'class'),
      (2, 'helperMethod', 'src/Models/ExamResult.php', 'method'),
      (3, 'Model',        'src/Support/Model.php',      'class');
  `);
  db.exec(`
    INSERT INTO edges (source, target, kind, line, col) VALUES
      (1, 2, 'calls',   5, 4),
      (1, 3, 'extends', 1, 0);
  `);
  db.close();

  adapter = CodeGraphAdapter.open(projectRoot);
});

after(() => {
  adapter?.close();
  fs.rmSync(projectRoot, { recursive: true, force: true });
});

test('adapter opens successfully against a populated DB and reports ready', () => {
  assert.ok(adapter);
  assert.equal(adapter!.isReady(), true);
});

test('getFileTokens includes SAME-FILE references (regression: previously excluded, breaking in-code glow/thread highlighting)', () => {
  const tokens = adapter!.getFileTokens('src/Models/ExamResult.php');
  const sameFile = tokens.find(t => t.name === 'helperMethod');
  assert.ok(sameFile, 'expected the same-file "calls helperMethod" edge to be present');
  assert.equal(sameFile!.targetFile, 'src/Models/ExamResult.php');
  assert.equal(sameFile!.kind, 'calls');
});

test('getFileTokens still includes cross-file references', () => {
  const tokens = adapter!.getFileTokens('src/Models/ExamResult.php');
  const crossFile = tokens.find(t => t.name === 'Model');
  assert.ok(crossFile, 'expected the cross-file "extends Model" edge to be present');
  assert.equal(crossFile!.targetFile, 'src/Support/Model.php');
});

test('getFileTokens returns exactly 2 tokens (one same-file, one cross-file) for this fixture', () => {
  const tokens = adapter!.getFileTokens('src/Models/ExamResult.php');
  assert.equal(tokens.length, 2);
});

test('getEdgesForFile intentionally EXCLUDES same-file edges (file-level wiki-link graph, unlike getFileTokens)', () => {
  const edges = adapter!.getEdgesForFile('src/Models/ExamResult.php');
  assert.equal(edges.length, 1);
  assert.equal(edges[0].targetFile, 'src/Support/Model.php');
});

test('getAllEdges returns only cross-file structural edges', () => {
  const edges = adapter!.getAllEdges();
  assert.equal(edges.length, 1);
  assert.equal(edges[0].sourceFile, 'src/Models/ExamResult.php');
  assert.equal(edges[0].targetFile, 'src/Support/Model.php');
});

test('getFileTokens accepts an absolute path and resolves it relative to projectRoot', () => {
  const absPath = path.join(projectRoot, 'src/Models/ExamResult.php');
  const tokens = adapter!.getFileTokens(absPath);
  assert.equal(tokens.length, 2);
});

test('a not-ready adapter (empty nodes table) reports isReady() === false', () => {
  const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'syndocs-graph-empty-'));
  fs.mkdirSync(path.join(emptyRoot, '.codegraph'));
  const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
  const db = new DatabaseSync(path.join(emptyRoot, '.codegraph', 'codegraph.db'));
  db.exec(`
    CREATE TABLE nodes (id INTEGER PRIMARY KEY, name TEXT, file_path TEXT, kind TEXT);
    CREATE TABLE edges (id INTEGER PRIMARY KEY, source INTEGER, target INTEGER, kind TEXT, line INTEGER, col INTEGER);
  `);
  db.close();

  const emptyAdapter = CodeGraphAdapter.open(emptyRoot);
  assert.ok(emptyAdapter);
  assert.equal(emptyAdapter!.isReady(), false);
  // Even though not "ready" by our convention, the methods themselves
  // should degrade to empty results rather than throwing — callers are
  // expected to check isReady() themselves before deciding whether to
  // trust/display the (empty) results as "no data" vs. "not indexed".
  assert.deepEqual(emptyAdapter!.getFileTokens('src/x.ts'), []);

  emptyAdapter!.close();
  fs.rmSync(emptyRoot, { recursive: true, force: true });
});

test('CodeGraphAdapter.open() returns null when no .codegraph/codegraph.db exists', () => {
  const noDbRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'syndocs-graph-nodb-'));
  const result = CodeGraphAdapter.open(noDbRoot);
  assert.equal(result, null);
  fs.rmSync(noDbRoot, { recursive: true, force: true });
});
