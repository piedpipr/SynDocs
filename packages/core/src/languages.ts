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
