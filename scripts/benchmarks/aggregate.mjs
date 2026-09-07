#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { aggregateRecords, parseJsonLines, stableStringify } from './lib/core.mjs';

const USAGE = '用法: node scripts/benchmarks/aggregate.mjs --input <run.jsonl> --output <aggregate.json>';

function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    return { help: true };
  }
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--input' || argument === '--output') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${argument} 缺少值`);
      }
      args[argument.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`未知参数: ${argument}`);
  }
  if (!args.input || !args.output) {
    throw new Error(USAGE);
  }
  return args;
}

export function aggregateFile(inputPath, outputPath) {
  const records = parseJsonLines(fs.readFileSync(inputPath, 'utf8'));
  const aggregate = aggregateRecords(records);
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(outputPath, `${stableStringify(aggregate)}\n`, 'utf8');
  return aggregate;
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log(USAGE);
      return;
    }
    const aggregate = aggregateFile(path.resolve(args.input), path.resolve(args.output));
    console.log(`已聚合 ${aggregate.totals.executed} 个正式样本（${aggregate.totals.warmups} 个预热样本已排除）`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
