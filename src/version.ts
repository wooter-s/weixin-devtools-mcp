/**
 * 版本号管理
 * 从 package.json 动态读取，避免手动同步
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

export const VERSION = pkg.version;
