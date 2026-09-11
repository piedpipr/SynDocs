# languages.ts
<!-- syndocs-hash: 7f3ff3bdc7a9 -->

```ts
// @syndocs
import type { CommentStyle, LanguageConfig } from './types';

// Map of file extension → language config.
// Add rows here as you expand to new languages — don't add all of them upfront.
const BY_EXTENSION: Record<string, LanguageConfig> = {
  // // style
  js:   { style: '//', codeBlock: 'js'     },
  ts:   { style: '//', codeBlock: 'ts'     },
  jsx:  { style: '//', codeBlock: 'jsx'    },
  tsx:  { style: '//', codeBlock: 'tsx'    },
  go:   { style: '//', codeBlock: 'go'     },
  rs:   { style: '//', codeBlock: 'rust'   },
  java: { style: '//', codeBlock: 'java'   },
  c:    { style: '//', codeBlock: 'c'      },
  cpp:  { style: '//', codeBlock: 'cpp'    },
  cs:   { style: '//', codeBlock: 'csharp' },
  php:  { style: '//', codeBlock: 'php'    },
  swift:{ style: '//', codeBlock: 'swift'  },
  kt:   { style: '//', codeBlock: 'kotlin' },

  // # style
  py:       { style: '#', codeBlock: 'python'     },
  rb:       { style: '#', codeBlock: 'ruby'       },
  sh:       { style: '#', codeBlock: 'bash'       },
  bash:     { style: '#', codeBlock: 'bash'       },
  zsh:      { style: '#', codeBlock: 'bash'       },
  yaml:     { style: '#', codeBlock: 'yaml'       },
  yml:      { style: '#', codeBlock: 'yaml'       },
  dockerfile:{ style: '#', codeBlock: 'dockerfile' },

  // -- style
  sql: { style: '--', codeBlock: 'sql' },
  lua: { style: '--', codeBlock: 'lua' },

  // <!-- --> style
  html: { style: '<!--', closeStyle: '-->', codeBlock: 'html' },
  xml:  { style: '<!--', closeStyle: '-->', codeBlock: 'xml'  },

  // /* */ style
  css:  { style: '/*', codeBlock: 'css'  },
  scss: { style: '/*', codeBlock: 'scss' },
  sass: { style: '/*', codeBlock: 'sass' },
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

// ─── Regex builders ───────────────────────────────────────────────────────────
// All regex builders use RegExp constructor with regular string literals.
// In a regular string, `\\s` becomes the regex token `\s` (whitespace).

/**
 * Build a regex that matches a FULL-LINE comment containing @syndocs or @synd.
 * The entire line must be a comment (no code before it).
 * Captures: group 1 = optional label after the colon.
 */
export function buildAnchorRegex(style: CommentStyle): RegExp {
  const body = '@(?:syndocs|synd)(?:\\s*:\\s*(\\S+))?';

  switch (style) {
    case '//':   return new RegExp('^\\s*\\/\\/\\s*' + body);
    case '#':    return new RegExp('^\\s*#\\s*'      + body);
    case '--':   return new RegExp('^\\s*--\\s*'     + body);
    case '<!--': return new RegExp('^\\s*<!--\\s*'   + body + '\\s*-->');
    case '/*':   return new RegExp('^\\s*\\/\\*\\s*' + body + '\\s*\\*\\/');
  }
}

/**
 * Build a regex that matches an INLINE (trailing) @syndocs or @synd annotation.
 * These appear after code on the same line: `const X = 1; // @synd`
 * Captures: group 1 = optional label.
 */
export function buildInlineAnchorRegex(style: CommentStyle): RegExp {
  const body = '@(?:syndocs|synd)(?:\\s*:\\s*(\\S+))?';

  switch (style) {
    case '//':   return new RegExp('.+\\s*\\/\\/\\s*' + body);
    case '#':    return new RegExp('.+\\s*#\\s*'      + body);
    case '--':   return new RegExp('.+\\s*--\\s*'     + body);
    case '<!--': return new RegExp('.+\\s*<!--\\s*'   + body + '\\s*-->');
    case '/*':   return new RegExp('.+\\s*\\/\\*\\s*' + body + '\\s*\\*\\/');
  }
}

/**
 * Build a regex that matches @syndocs-embed or @synd-embed directives.
 * Captures: group 1 = target path (possibly with #label).
 */
export function buildEmbedRegex(style: CommentStyle): RegExp {
  const body = '@(?:syndocs|synd)-embed:\\s*(\\S+)';

  switch (style) {
    case '//':   return new RegExp('^\\s*\\/\\/\\s*' + body);
    case '#':    return new RegExp('^\\s*#\\s*'      + body);
    case '--':   return new RegExp('^\\s*--\\s*'     + body);
    case '<!--': return new RegExp('^\\s*<!--\\s*'   + body + '\\s*-->');
    case '/*':   return new RegExp('^\\s*\\/\\*\\s*' + body + '\\s*\\*\\/');
  }
}
```

## Notes

> _Add documentation notes here._
