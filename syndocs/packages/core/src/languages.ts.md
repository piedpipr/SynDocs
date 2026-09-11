# languages.ts
<!-- syndocs-hash: 450e127fce9b -->

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

// Build a regex that matches a comment containing @syndocs (or @syndocs: label).
// Uses string concatenation (not template literals) so that \\s escape sequences
// survive into the RegExp engine correctly.
export function buildAnchorRegex(style: CommentStyle): RegExp {
  // In a regular string literal, \\s compiles to \s which RegExp reads as whitespace.
  const ws   = '\\s*';
  const body = '@syndocs(?::\\s*(\\S+))?';

  switch (style) {
    case '//':  return new RegExp('^' + ws + '\\/\\/' + ws + body);
    case '#':   return new RegExp('^' + ws + '#'      + ws + body);
    case '--':  return new RegExp('^' + ws + '--'     + ws + body);
    case '<!--': return new RegExp('^' + ws + '<!--'  + ws + body + ws + '-->');
    case '/*':  return new RegExp('^' + ws + '\\/\\*' + ws + body + ws + '\\*\\/');
  }
}
```

## Notes

> _Add documentation notes here._
