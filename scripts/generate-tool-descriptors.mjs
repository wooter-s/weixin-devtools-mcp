#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const outputPath = path.join(
  projectRoot,
  'build',
  'protocol',
  'tool-descriptors.generated.json',
);

const [{ allTools }, { buildToolDescriptors }, { createToolDescriptorManifest }] =
  await Promise.all([
    import('../build/tools/tools.js'),
    import('../build/protocol/tool-descriptors.js'),
    import('../build/protocol/tool-descriptor-manifest.js'),
  ]);

const manifest = createToolDescriptorManifest(buildToolDescriptors(allTools));
const serialized = `${JSON.stringify(manifest)}\n`;

if (process.argv.includes('--check')) {
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
  if (current !== serialized) {
    console.error('工具描述符 manifest 已过期，请执行 npm run build');
    process.exitCode = 1;
  }
} else {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized, 'utf8');
  console.log(`✓ 已生成 ${manifest.toolCount} 个工具描述符`);
}
