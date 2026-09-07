#!/usr/bin/env node
/* eslint-env node */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { console, process, URL } = globalThis;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(process.env.README_LINK_CHECK_ROOT ?? path.resolve(__dirname, '..'));

const README_PATH = path.join(REPO_ROOT, 'README.md');
const DOCS_DIR = path.join(REPO_ROOT, 'docs');
const PACKAGE_JSON_PATH = path.join(REPO_ROOT, 'package.json');
const CHANGELOG_PATH = path.join(REPO_ROOT, 'CHANGELOG.md');
const PACKAGE_LOCK_PATH = path.join(REPO_ROOT, 'package-lock.json');

const README_PATHS = [README_PATH, path.join(REPO_ROOT, 'README.zh-CN.md')];
const CHECK_ROOTS = [...README_PATHS, DOCS_DIR, path.join(REPO_ROOT, 'CONTRIBUTING.md'), path.join(REPO_ROOT, 'SECURITY.md'), path.join(REPO_ROOT, 'tests/fixtures/monitoring-app/README.md')];
const EXCLUDED_DOC_PREFIXES = ['docs/小程序开发工具/', 'docs/mpx/'];

const MARKDOWN_LINK_REGEX = /!?\[[^\]]*\]\(([^)]+)\)/g;
const URL_REGEX = /https?:\/\/[^\s)"'>]+/g;
const PLACEHOLDER_OWNER = 'yourusername';
const PLACEHOLDER_REPO = 'weixin-devtools-mcp';
const PLACEHOLDER_TEXT = `${PLACEHOLDER_OWNER}/${PLACEHOLDER_REPO}`;
const PLACEHOLDER_REGEX = new RegExp(PLACEHOLDER_TEXT, 'gi');
const GITHUB_BLOB_SEGMENT = 'blob';

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function collectMarkdownFiles(dirPath) {
  const results = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectMarkdownFiles(absolutePath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(absolutePath);
    }
  }

  return results;
}

function toRelativePath(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/') || path.basename(filePath);
}

function shouldSkipCheckFile(filePath) {
  const relativePath = toRelativePath(filePath);
  return EXCLUDED_DOC_PREFIXES.some((prefix) => relativePath.startsWith(prefix));
}

function collectCheckFiles() {
  const files = [];

  for (const rootPath of CHECK_ROOTS) {
    if (!fs.existsSync(rootPath)) {
      continue;
    }

    const stat = fs.statSync(rootPath);
    if (stat.isFile()) {
      if (!shouldSkipCheckFile(rootPath)) {
        files.push(rootPath);
      }
      continue;
    }

    if (stat.isDirectory()) {
      for (const markdownFile of collectMarkdownFiles(rootPath)) {
        if (!shouldSkipCheckFile(markdownFile)) {
          files.push(markdownFile);
        }
      }
    }
  }

  return files;
}

function extractMarkdownLinkTargets(markdownContent) {
  const links = [];
  for (const match of markdownContent.matchAll(MARKDOWN_LINK_REGEX)) {
    links.push(match[1]?.trim() ?? '');
  }
  return links;
}

function normalizeMarkdownLinkTarget(rawTarget) {
  let target = rawTarget.trim();

  if (target.startsWith('<') && target.endsWith('>')) {
    target = target.slice(1, -1).trim();
  }

  const titleMatch = target.match(/^(\S+)(?:\s+["'][\s\S]*)?$/);
  if (titleMatch?.[1]) {
    return titleMatch[1];
  }

  return target;
}

function isRelativeLink(target) {
  if (!target || target.startsWith('#') || target.startsWith('/')) {
    return false;
  }

  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(target)) {
    return false;
  }

  if (target.startsWith('//')) {
    return false;
  }

  return true;
}

function parseLinkTarget(target) {
  const hashIndex = target.indexOf('#');
  const beforeHash = hashIndex >= 0 ? target.slice(0, hashIndex) : target;
  const anchor = hashIndex >= 0 ? target.slice(hashIndex + 1) : '';
  const queryIndex = beforeHash.indexOf('?');
  const pathPart = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash;

  return {
    pathPart,
    anchor,
  };
}

function getLinkPathPart(target) {
  return parseLinkTarget(target).pathPart;
}

function shouldCheckAsMarkdownPath(target) {
  const pathPart = getLinkPathPart(target);
  if (!pathPart) {
    return false;
  }

  if (pathPart.endsWith('/')) {
    return true;
  }

  const ext = path.extname(pathPart).toLowerCase();
  if (!ext) {
    return true;
  }

  return ext === '.md';
}

function resolveLinkTarget(baseFilePath, targetPathPart) {
  let decodedPath = targetPathPart;
  try {
    decodedPath = decodeURIComponent(targetPathPart);
  } catch {
    // 保留原始路径，交给后续存在性校验处理。
  }

  return path.resolve(path.dirname(baseFilePath), decodedPath);
}

function resolveExistingLinkTarget(baseFilePath, targetPathPart) {
  const resolvedTargetPath = resolveLinkTarget(baseFilePath, targetPathPart);

  if (targetPathPart.endsWith('/')) {
    if (fs.existsSync(resolvedTargetPath) && fs.statSync(resolvedTargetPath).isDirectory()) {
      return resolvedTargetPath;
    }
    return null;
  }

  if (fs.existsSync(resolvedTargetPath)) {
    return resolvedTargetPath;
  }

  if (!path.extname(targetPathPart)) {
    const withMd = `${resolvedTargetPath}.md`;
    if (fs.existsSync(withMd)) {
      return withMd;
    }

    const indexMd = path.join(resolvedTargetPath, 'index.md');
    if (fs.existsSync(indexMd)) {
      return indexMd;
    }

    const readmeMd = path.join(resolvedTargetPath, 'README.md');
    if (fs.existsSync(readmeMd)) {
      return readmeMd;
    }
  }

  return null;
}

function normalizeRepoUrl(url) {
  return url
    .replace(/^git\+/, '')
    .replace(/\.git$/, '')
    .replace(/\/$/, '');
}

function getRepositoryUrl(packageJson) {
  const repository = packageJson.repository;

  if (typeof repository === 'string') {
    return normalizeRepoUrl(repository);
  }

  if (repository && typeof repository.url === 'string') {
    return normalizeRepoUrl(repository.url);
  }

  throw new Error('package.json 缺少 repository.url');
}

function parseGitHubRepoPath(repoUrl) {
  const parsedUrl = new URL(repoUrl);
  if (parsedUrl.hostname !== 'github.com') {
    throw new Error(`repository.url 不是 GitHub 地址: ${repoUrl}`);
  }

  return parsedUrl.pathname.replace(/^\//, '').replace(/\/$/, '');
}

function normalizePackageFileEntry(entry) {
  return entry.replace(/^\.\//, '').replace(/\/$/, '');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasGlobPattern(value) {
  return /[*?[\]{}]/.test(value);
}

function isPublishedPath(relativePath, packageJson) {
  const files = Array.isArray(packageJson.files) ? packageJson.files : [];
  const normalizedPath = relativePath.replace(/\\/g, '/');

  for (const rawEntry of files) {
    if (typeof rawEntry !== 'string' || rawEntry.length === 0) {
      continue;
    }

    const entry = normalizePackageFileEntry(rawEntry);
    if (!entry || hasGlobPattern(entry)) {
      continue;
    }

    if (normalizedPath === entry || normalizedPath.startsWith(`${entry}/`)) {
      return true;
    }
  }

  return false;
}

function validateRelativeLinks(markdownFiles) {
  const failures = [];

  for (const filePath of markdownFiles) {
    const content = readText(filePath);
    const targets = extractMarkdownLinkTargets(content);

    for (const rawTarget of targets) {
      const normalizedTarget = normalizeMarkdownLinkTarget(rawTarget);
      if (!isRelativeLink(normalizedTarget) || !shouldCheckAsMarkdownPath(normalizedTarget)) {
        continue;
      }

      const { pathPart } = parseLinkTarget(normalizedTarget);
      const resolvedTarget = resolveExistingLinkTarget(filePath, pathPart);

      if (!resolvedTarget) {
        failures.push({
          filePath,
          target: normalizedTarget,
        });
      }
    }
  }

  return failures;
}

function validatePlaceholders(markdownFiles) {
  const failures = [];

  for (const filePath of markdownFiles) {
    const content = readText(filePath);
    const matches = content.match(PLACEHOLDER_REGEX);
    if (!matches || matches.length === 0) {
      continue;
    }

    failures.push({
      filePath,
      count: matches.length,
    });
  }

  return failures;
}

function validateReadmeRepositoryConsistency(readmeContent, packageJson) {
  const failures = [];

  const repositoryUrl = getRepositoryUrl(packageJson);
  const bugsUrl = packageJson.bugs?.url;
  const homepageUrl = packageJson.homepage;

  if (typeof bugsUrl !== 'string' || bugsUrl.length === 0) {
    failures.push('package.json 缺少 bugs.url');
  }

  if (typeof homepageUrl !== 'string' || homepageUrl.length === 0) {
    failures.push('package.json 缺少 homepage');
  }

  if (!readmeContent.includes(repositoryUrl)) {
    failures.push(`README.md 未包含 repository URL: ${repositoryUrl}`);
  }

  if (typeof bugsUrl === 'string' && !readmeContent.includes(bugsUrl)) {
    failures.push(`README.md 未包含 bugs URL: ${bugsUrl}`);
  }

  const expectedRepoPath = parseGitHubRepoPath(repositoryUrl);
  const expectedRepoName = expectedRepoPath.split('/')[1];
  const urlsInReadme = readmeContent.match(URL_REGEX) ?? [];

  for (const urlText of urlsInReadme) {
    let parsed;
    try {
      parsed = new URL(urlText);
    } catch {
      continue;
    }

    if (parsed.hostname !== 'github.com') {
      continue;
    }

    const segments = parsed.pathname.replace(/^\//, '').replace(/\/$/, '').split('/');
    if (segments.length < 2) {
      continue;
    }

    const actualRepoName = segments[1].replace(/\.git$/, '');
    if (actualRepoName !== expectedRepoName) {
      continue;
    }

    const actualRepoPath = `${segments[0]}/${actualRepoName}`;
    if (actualRepoPath !== expectedRepoPath) {
      failures.push(`README.md 包含与 package.json 不一致的仓库链接: ${urlText}`);
    }
  }

  if (typeof homepageUrl === 'string' && homepageUrl.length > 0) {
    const normalizedHomepage = normalizeRepoUrl(homepageUrl).replace(/#readme$/, '');
    if (normalizedHomepage !== repositoryUrl) {
      failures.push(
        `package.json homepage 与 repository 不一致: homepage=${homepageUrl}, repository=${repositoryUrl}`
      );
    }
  }

  return failures;
}

function validateReadmePublishedRelativeLinks(readmeContent, packageJson) {
  const failures = [];
  const targets = extractMarkdownLinkTargets(readmeContent);

  for (const rawTarget of targets) {
    const normalizedTarget = normalizeMarkdownLinkTarget(rawTarget);
    if (!isRelativeLink(normalizedTarget)) {
      continue;
    }

    const { pathPart } = parseLinkTarget(normalizedTarget);
    if (!pathPart) {
      continue;
    }

    const resolvedTarget = resolveExistingLinkTarget(README_PATH, pathPart);
    if (!resolvedTarget) {
      continue;
    }

    const relativeTargetPath = toRelativePath(resolvedTarget);
    if (!isPublishedPath(relativeTargetPath, packageJson)) {
      failures.push({
        target: normalizedTarget,
        relativeTargetPath,
      });
    }
  }

  return failures;
}

function validateReadmeDirectoryLinks(readmeContent) {
  const failures = [];
  const targets = extractMarkdownLinkTargets(readmeContent);

  for (const rawTarget of targets) {
    const normalizedTarget = normalizeMarkdownLinkTarget(rawTarget);
    if (!isRelativeLink(normalizedTarget)) {
      continue;
    }

    const { pathPart } = parseLinkTarget(normalizedTarget);
    if (!pathPart) {
      continue;
    }

    const resolvedTarget = resolveExistingLinkTarget(README_PATH, pathPart);
    if (!resolvedTarget || !fs.statSync(resolvedTarget).isDirectory()) {
      continue;
    }

    failures.push({
      target: normalizedTarget,
      relativeTargetPath: toRelativePath(resolvedTarget),
    });
  }

  return failures;
}

function validateReadmeVersionBadge(readmeContent, packageJson) {
  const escapedVersion = escapeRegExp(String(packageJson.version ?? ''));
  const badgePattern = new RegExp(`https://img\\.shields\\.io/badge/version-${escapedVersion}-[^)\\s]+`);

  return badgePattern.test(readmeContent)
    ? []
    : [`README.md version badge 必须等于 package.json.version (${packageJson.version})`];
}

function validateChangelogVersion(packageJson) {
  if (!fs.existsSync(CHANGELOG_PATH)) {
    return ['CHANGELOG.md 不存在'];
  }

  const changelogContent = readText(CHANGELOG_PATH);
  const match = changelogContent.match(/^##\s+(v[^\s]+)\s*(?:\([^\n]+\))?/m);
  const expectedVersion = `v${packageJson.version}`;

  if (!match?.[1]) {
    return ['CHANGELOG.md 缺少 release 标题'];
  }

  return match[1] === expectedVersion
    ? []
    : [`CHANGELOG.md 最新版本必须等于 ${expectedVersion}，当前为 ${match[1]}`];
}

function validatePackageLockConsistency(packageJson) {
  if (!fs.existsSync(PACKAGE_LOCK_PATH)) {
    return ['package-lock.json 不存在'];
  }

  const packageLock = readJson(PACKAGE_LOCK_PATH);
  const rootPackage = packageLock.packages?.[''];
  const failures = [];

  if (packageLock.name !== packageJson.name) {
    failures.push(`package-lock.json 顶层 name 必须等于 package.json.name (${packageJson.name})，当前为 ${String(packageLock.name)}`);
  }

  if (packageLock.version !== packageJson.version) {
    failures.push(`package-lock.json 顶层 version 必须等于 package.json.version (${packageJson.version})，当前为 ${String(packageLock.version)}`);
  }

  if (!rootPackage || typeof rootPackage !== 'object') {
    failures.push('package-lock.json 缺少 packages[""] 根包定义');
    return failures;
  }

  if (rootPackage.name !== packageJson.name) {
    failures.push(`package-lock.json packages[""].name 必须等于 package.json.name (${packageJson.name})，当前为 ${String(rootPackage.name)}`);
  }

  if (rootPackage.version !== packageJson.version) {
    failures.push(`package-lock.json packages[""].version 必须等于 package.json.version (${packageJson.version})，当前为 ${String(rootPackage.version)}`);
  }

  return failures;
}

function decodeAnchor(anchor) {
  try {
    return decodeURIComponent(anchor).trim().toLowerCase();
  } catch {
    return anchor.trim().toLowerCase();
  }
}

function stripMarkdownFormatting(text) {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_~]/g, '');
}

function createAnchorSlug(headingText) {
  return stripMarkdownFormatting(headingText)
    .trim()
    .toLowerCase()
    .replace(/[^\P{Cc}\n\r\t]/gu, '')
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function collectMarkdownAnchors(markdownContent) {
  const anchors = new Set();
  const duplicateCounts = new Map();
  const headingRegex = /^#{1,6}\s+(.*?)\s*#*\s*$/gm;

  // 近似 GitHub heading slug 规则，用于拦截常见锚点回归。
  for (const match of markdownContent.matchAll(headingRegex)) {
    const baseSlug = createAnchorSlug(match[1] ?? '');
    if (!baseSlug) {
      continue;
    }

    const duplicateIndex = duplicateCounts.get(baseSlug) ?? 0;
    duplicateCounts.set(baseSlug, duplicateIndex + 1);

    anchors.add(duplicateIndex === 0 ? baseSlug : `${baseSlug}-${duplicateIndex}`);
  }

  return anchors;
}

function resolveSameRepoMarkdownTarget(target, packageJson) {
  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return null;
  }

  if (parsed.hostname !== 'github.com') {
    return null;
  }

  const expectedRepoPath = parseGitHubRepoPath(getRepositoryUrl(packageJson));
  const segments = parsed.pathname.replace(/^\//, '').split('/').map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  });

  if (segments.length < 5) {
    return null;
  }

  const actualRepoPath = `${segments[0]}/${segments[1].replace(/\.git$/, '')}`;
  if (actualRepoPath !== expectedRepoPath || segments[2] !== GITHUB_BLOB_SEGMENT) {
    return null;
  }

  const repoRelativePath = segments.slice(4).join('/');
  if (!repoRelativePath.toLowerCase().endsWith('.md')) {
    return null;
  }

  const absolutePath = path.join(REPO_ROOT, repoRelativePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return null;
  }

  return absolutePath;
}

function resolveAnchorTargetFile(sourceFilePath, normalizedTarget, packageJson) {
  const { pathPart, anchor } = parseLinkTarget(normalizedTarget);
  if (!anchor) {
    return null;
  }

  if (!pathPart) {
    return sourceFilePath;
  }

  if (isRelativeLink(normalizedTarget)) {
    if (!shouldCheckAsMarkdownPath(normalizedTarget)) {
      return null;
    }

    const resolvedTarget = resolveExistingLinkTarget(sourceFilePath, pathPart);
    if (!resolvedTarget || fs.statSync(resolvedTarget).isDirectory()) {
      return null;
    }

    return path.extname(resolvedTarget).toLowerCase() === '.md' ? resolvedTarget : null;
  }

  return resolveSameRepoMarkdownTarget(normalizedTarget, packageJson);
}

function validateMarkdownAnchors(markdownFiles, packageJson) {
  const failures = [];
  const anchorCache = new Map();

  for (const filePath of markdownFiles) {
    const content = readText(filePath);
    const targets = extractMarkdownLinkTargets(content);

    for (const rawTarget of targets) {
      const normalizedTarget = normalizeMarkdownLinkTarget(rawTarget);
      const { anchor } = parseLinkTarget(normalizedTarget);
      if (!anchor) {
        continue;
      }

      const targetFilePath = resolveAnchorTargetFile(filePath, normalizedTarget, packageJson);
      if (!targetFilePath) {
        continue;
      }

      if (!anchorCache.has(targetFilePath)) {
        anchorCache.set(targetFilePath, collectMarkdownAnchors(readText(targetFilePath)));
      }

      const normalizedAnchor = decodeAnchor(anchor);
      if (!anchorCache.get(targetFilePath).has(normalizedAnchor)) {
        failures.push({
          filePath,
          target: normalizedTarget,
          targetFilePath,
          anchor: normalizedAnchor,
        });
      }
    }
  }

  return failures;
}

function main() {
  if (!fs.existsSync(README_PATH)) {
    console.error('✗ README.md 不存在');
    process.exit(1);
  }

  if (!fs.existsSync(PACKAGE_JSON_PATH)) {
    console.error('✗ package.json 不存在');
    process.exit(1);
  }

  const packageJson = readJson(PACKAGE_JSON_PATH);
  const readmeContents = README_PATHS.filter(file => fs.existsSync(file)).map(readText);
  const markdownFiles = collectCheckFiles();

  const relativeLinkFailures = validateRelativeLinks(markdownFiles);
  const placeholderFailures = validatePlaceholders(markdownFiles);
  const repositoryFailures = readmeContents.flatMap(content => validateReadmeRepositoryConsistency(content, packageJson));
  const readmePublishedFailures = readmeContents.flatMap(content => validateReadmePublishedRelativeLinks(content, packageJson));
  const readmeDirectoryFailures = readmeContents.flatMap(content => validateReadmeDirectoryLinks(content));
  const readmeVersionFailures = readmeContents.flatMap(content => validateReadmeVersionBadge(content, packageJson));
  const changelogFailures = validateChangelogVersion(packageJson);
  const packageLockFailures = validatePackageLockConsistency(packageJson);
  const anchorFailures = validateMarkdownAnchors(markdownFiles, packageJson);

  let hasFailure = false;

  if (relativeLinkFailures.length > 0) {
    hasFailure = true;
    console.error('\n✗ Markdown 相对链接校验失败:');
    for (const failure of relativeLinkFailures) {
      console.error(`  - ${toRelativePath(failure.filePath)} -> ${failure.target}`);
    }
  }

  if (placeholderFailures.length > 0) {
    hasFailure = true;
    console.error('\n✗ 占位符链接校验失败:');
    for (const failure of placeholderFailures) {
      console.error(`  - ${toRelativePath(failure.filePath)}: ${failure.count} 处 ${PLACEHOLDER_TEXT}`);
    }
  }

  if (repositoryFailures.length > 0) {
    hasFailure = true;
    console.error('\n✗ README 与 package.json 仓库信息一致性校验失败:');
    for (const failure of repositoryFailures) {
      console.error(`  - ${failure}`);
    }
  }

  if (readmePublishedFailures.length > 0) {
    hasFailure = true;
    console.error('\n✗ README npm 发布视角链接校验失败:');
    for (const failure of readmePublishedFailures) {
      console.error(`  - README.md -> ${failure.target}（目标 ${failure.relativeTargetPath} 不在 package.json.files 中）`);
    }
  }

  if (readmeDirectoryFailures.length > 0) {
    hasFailure = true;
    console.error('\n✗ README 目录链接校验失败:');
    for (const failure of readmeDirectoryFailures) {
      console.error(`  - README.md -> ${failure.target}（目录 ${failure.relativeTargetPath}）`);
    }
  }

  if (readmeVersionFailures.length > 0) {
    hasFailure = true;
    console.error('\n✗ README 版本徽章校验失败:');
    for (const failure of readmeVersionFailures) {
      console.error(`  - ${failure}`);
    }
  }

  if (changelogFailures.length > 0) {
    hasFailure = true;
    console.error('\n✗ CHANGELOG 版本校验失败:');
    for (const failure of changelogFailures) {
      console.error(`  - ${failure}`);
    }
  }

  if (packageLockFailures.length > 0) {
    hasFailure = true;
    console.error('\n✗ package-lock.json 一致性校验失败:');
    for (const failure of packageLockFailures) {
      console.error(`  - ${failure}`);
    }
  }

  if (anchorFailures.length > 0) {
    hasFailure = true;
    console.error('\n✗ Markdown 锚点校验失败:');
    for (const failure of anchorFailures) {
      console.error(
        `  - ${toRelativePath(failure.filePath)} -> ${failure.target}（${toRelativePath(failure.targetFilePath)} 中缺少 #${failure.anchor}）`
      );
    }
  }

  if (hasFailure) {
    process.exit(1);
  }

  console.log('✓ 一致性校验通过（README + docs + version metadata）');
}

main();
