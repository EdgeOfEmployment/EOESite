/**
 * Names a parameter may not take, because some target language or the generated harness would
 * reject or misread them. Only lowercase-initial names matter: the name rule already requires
 * `^[a-z]`. `stdin`/`stdout`/`stderr`/`errno` are object-like macros in common C libraries
 * (MSVCRT defines `stdin` as `(&_iob[0])`), so a parameter with that name would not compile.
 */
const C_NAMES = [
  'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum',
  'extern', 'float', 'for', 'goto', 'if', 'inline', 'int', 'long', 'register', 'restrict', 'return',
  'short', 'signed', 'sizeof', 'static', 'struct', 'switch', 'typedef', 'union', 'unsigned', 'void',
  'volatile', 'while', 'bool', 'true', 'false', 'stdin', 'stdout', 'stderr', 'errno', 'unix', 'linux',
]

const JS_NAMES = [
  'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete',
  'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if',
  'implements', 'import', 'in', 'instanceof', 'interface', 'let', 'new', 'null', 'package',
  'private', 'protected', 'public', 'return', 'static', 'super', 'switch', 'this', 'throw', 'true',
  'try', 'typeof', 'var', 'void', 'while', 'with', 'yield', 'arguments', 'eval', 'undefined',
]

const PYTHON_NAMES = [
  'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif',
  'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda',
  'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
]

const JAVA_NAMES = [
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const',
  'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float',
  'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native',
  'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp',
  'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'void',
  'volatile', 'while', 'var', 'record', 'yield', 'true', 'false', 'null',
]

const HARNESS_NAMES = ['solution', 'main', 'ret_len', 'ret_rows', 'ret_cols']

export const RESERVED_NAMES: ReadonlySet<string> = new Set([
  ...C_NAMES,
  ...JS_NAMES,
  ...PYTHON_NAMES,
  ...JAVA_NAMES,
  ...HARNESS_NAMES,
])
