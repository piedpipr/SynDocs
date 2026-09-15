// @syndocs
import type { LanguageConfig } from './types';

// Map of file extension → language config.
// `grammarId` must be a key in shiki's `bundledLanguages` (see tokenizer.ts) —
// comment detection is delegated entirely to that grammar, so this table no
// longer encodes comment syntax itself. Add rows here as you expand to new
// languages — don't add all of them upfront.
const BY_EXTENSION: Record<string, LanguageConfig> = {
  js:   { grammarId: 'javascript',  codeBlock: 'js'     },
  ts:   { grammarId: 'typescript',  codeBlock: 'ts'     },
  jsx:  { grammarId: 'jsx',         codeBlock: 'jsx'    },
  tsx:  { grammarId: 'tsx',         codeBlock: 'tsx'    },
  go:   { grammarId: 'go',          codeBlock: 'go'     },
  rs:   { grammarId: 'rust',        codeBlock: 'rust'   },
  java: { grammarId: 'java',        codeBlock: 'java'   },
  c:    { grammarId: 'c',           codeBlock: 'c'      },
  cpp:  { grammarId: 'cpp',         codeBlock: 'cpp'    },
  cs:   { grammarId: 'csharp',      codeBlock: 'csharp' },
  php:  { grammarId: 'php',         codeBlock: 'php'    },
  swift:{ grammarId: 'swift',       codeBlock: 'swift'  },
  kt:   { grammarId: 'kotlin',      codeBlock: 'kotlin' },

  py:       { grammarId: 'python',      codeBlock: 'python'      },
  rb:       { grammarId: 'ruby',        codeBlock: 'ruby'        },
  sh:       { grammarId: 'shellscript', codeBlock: 'bash'        },
  bash:     { grammarId: 'shellscript', codeBlock: 'bash'        },
  zsh:      { grammarId: 'shellscript', codeBlock: 'bash'        },
  yaml:     { grammarId: 'yaml',        codeBlock: 'yaml'        },
  yml:      { grammarId: 'yaml',        codeBlock: 'yaml'        },
  dockerfile:{ grammarId: 'dockerfile', codeBlock: 'dockerfile'  },

  sql: { grammarId: 'sql', codeBlock: 'sql' },
  lua: { grammarId: 'lua', codeBlock: 'lua' },

  html: { grammarId: 'html', codeBlock: 'html' },
  xml:  { grammarId: 'xml',  codeBlock: 'xml'  },

  css:  { grammarId: 'css',  codeBlock: 'css'  },
  scss: { grammarId: 'scss', codeBlock: 'scss' },
  sass: { grammarId: 'sass', codeBlock: 'sass' },
};

export function getLangConfig(filePath: string): LanguageConfig | null {
  const basename = filePath.split('/').pop() ?? '';

  // Special case: bare "Dockerfile"
  if (basename.toLowerCase() === 'dockerfile') {
    return BY_EXTENSION['dockerfile']!;
  }

  const ext = basename.split('.').pop()?.toLowerCase() ?? '';
  return BY_EXTENSION[ext] ?? null;
}

export function getCodeBlockLang(filePath: string): string {
  return getLangConfig(filePath)?.codeBlock ?? '';
}

/** Every distinct grammar id SynDocs is configured to use — for bulk tokenizer warm-up. */
export function getAllConfiguredGrammarIds(): string[] {
  return [...new Set(Object.values(BY_EXTENSION).map(cfg => cfg.grammarId))];
}

/**
 * How to write a single-line comment in a given language.
 *
 * Comment *detection* is grammar-driven (see tokenizer.ts) and deliberately
 * doesn't live in this table. But *writing* a new annotation comment into a
 * source file (the Web UI's "Add Doc" action) needs to emit the right
 * syntax, which a read-only grammar can't tell us — hence this small
 * write-side map, keyed by grammarId so it stays in sync with BY_EXTENSION
 * rather than duplicating the extension list.
 *
 * `prefix`/`suffix` wrap the comment body. Languages without a line-comment
 * form (html/xml) use a block form via `suffix`.
 */
const COMMENT_SYNTAX_BY_GRAMMAR: Record<string, { prefix: string; suffix: string }> = {
  javascript: { prefix: '//', suffix: '' },
  typescript: { prefix: '//', suffix: '' },
  jsx:        { prefix: '//', suffix: '' },
  tsx:        { prefix: '//', suffix: '' },
  go:         { prefix: '//', suffix: '' },
  rust:       { prefix: '//', suffix: '' },
  java:       { prefix: '//', suffix: '' },
  c:          { prefix: '//', suffix: '' },
  cpp:        { prefix: '//', suffix: '' },
  csharp:     { prefix: '//', suffix: '' },
  php:        { prefix: '//', suffix: '' },
  swift:      { prefix: '//', suffix: '' },
  kotlin:     { prefix: '//', suffix: '' },

  python:      { prefix: '#', suffix: '' },
  ruby:        { prefix: '#', suffix: '' },
  shellscript: { prefix: '#', suffix: '' },
  yaml:        { prefix: '#', suffix: '' },
  dockerfile:  { prefix: '#', suffix: '' },

  sql: { prefix: '--', suffix: '' },
  lua: { prefix: '--', suffix: '' },

  html: { prefix: '<!--', suffix: ' -->' },
  xml:  { prefix: '<!--', suffix: ' -->' },

  // CSS family has no line-comment form — /* … */ only.
  css:  { prefix: '/*', suffix: ' */' },
  scss: { prefix: '//', suffix: '' },
  sass: { prefix: '//', suffix: '' },
};

/**
 * Returns the line-comment syntax for a file, or null if the language isn't
 * one SynDocs knows how to write comments for.
 */
export function getCommentSyntax(filePath: string): { prefix: string; suffix: string } | null {
  const cfg = getLangConfig(filePath);
  if (!cfg) return null;
  return COMMENT_SYNTAX_BY_GRAMMAR[cfg.grammarId] ?? null;
}
