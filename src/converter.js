const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');

async function collectPngs(inputs, recursive) {
  const found = new Set();
  async function visit(filePath) {
    let stat;
    try { stat = await fs.lstat(filePath); } catch { return; }
    if (stat.isSymbolicLink()) return;
    const name = path.basename(filePath);
    if (name.startsWith('.')) return;
    if (stat.isDirectory()) {
      let entries;
      try { entries = await fs.readdir(filePath, { withFileTypes: true }); } catch { return; }
      entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const child = path.join(filePath, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.png') found.add(path.resolve(child));
        else if (recursive && entry.isDirectory()) await visit(child);
      }
    } else if (stat.isFile() && path.extname(name).toLowerCase() === '.png') {
      found.add(path.resolve(filePath));
    }
  }
  for (const input of inputs) await visit(input);
  return [...found].sort((a, b) => a.localeCompare(b, 'en'));
}

async function hasJpegConflict(directory, baseName) {
  const wanted = new Set([`${baseName}.jpg`.toLowerCase(), `${baseName}.jpeg`.toLowerCase()]);
  let entries;
  try { entries = await fs.readdir(directory); } catch { return true; }
  return entries.some(name => wanted.has(name.toLowerCase()));
}

async function convertOne(source, quality) {
  const directory = path.dirname(source);
  const baseName = path.basename(source, path.extname(source));
  if (await hasJpegConflict(directory, baseName)) return 'skipped';

  const tempPath = path.join(directory, `.${baseName}.png-to-jpeg-${process.pid}-${crypto.randomUUID()}.tmp.jpg`);
  const outputPath = path.join(directory, `${baseName}.jpg`);
  try {
    await sharp(source)
      .flatten({ background: '#ffffff' })
      .jpeg({ quality, mozjpeg: true })
      .toFile(tempPath);
    const stat = await fs.stat(tempPath);
    if (!stat.isFile() || stat.size === 0) throw new Error('JPEG出力が空です');
    // Hard-link creation is atomic and fails rather than overwriting an existing file.
    await fs.link(tempPath, outputPath);
    return 'converted';
  } catch (error) {
    if (error.code === 'EEXIST') return 'skipped';
    return { status: 'failed', message: error.message };
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => {});
  }
}

async function convertInputs(inputs, { quality = 85, recursive = false } = {}) {
  if (!Number.isInteger(quality) || quality < 1 || quality > 100) {
    throw new RangeError('品質は1〜100の整数で指定してください');
  }
  const files = await collectPngs(inputs, recursive);
  const result = { found: files.length, converted: 0, skipped: 0, failed: [] };
  for (const file of files) {
    const outcome = await convertOne(file, quality);
    if (outcome === 'converted') result.converted++;
    else if (outcome === 'skipped') result.skipped++;
    else result.failed.push({ path: file, message: outcome.message });
  }
  return result;
}

module.exports = { collectPngs, convertInputs };
