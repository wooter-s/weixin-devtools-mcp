/**
 * 包元数据管理
 * 从 package.json 动态读取，避免运行时名称与版本手动同步。
 */

import { createRequire } from 'module';

interface PackageMetadata {
  name: string;
  version: string;
}

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as PackageMetadata;

export const PACKAGE_NAME = pkg.name;
export const VERSION = pkg.version;
