const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { collectPngs, convertInputs } = require('../src/converter');

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'png-jpeg-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

async function makePng(file, { width = 8, height = 5, rgba = [255, 0, 0, 128] } = {}) {
  await sharp({ create: { width, height, channels: 4, background: { r: rgba[0], g: rgba[1], b: rgba[2], alpha: rgba[3] / 255 } } }).png().toFile(file);
}

test('converts PNG to JPEG, keeps dimensions, and composites transparency on white', async t => {
  const dir = await fixture(t);
  const source = path.join(dir, '日本語 name.png');
  const target = path.join(dir, '日本語 name.jpg');
  await makePng(source, { rgba: [255, 0, 0, 0] });
  const result = await convertInputs([source]);
  assert.deepEqual({ found: result.found, converted: result.converted, skipped: result.skipped, failed: result.failed.length }, { found: 1, converted: 1, skipped: 0, failed: 0 });
  const image = sharp(target);
  assert.deepEqual(await image.metadata().then(({ width, height, format }) => ({ width, height, format })), { width: 8, height: 5, format: 'jpeg' });
  const { data } = await image.raw().toBuffer({ resolveWithObject: true });
  assert.ok(data[0] > 245 && data[1] > 245 && data[2] > 245, 'fully transparent pixels should become white');
  assert.equal((await fs.readFile(source)).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
});

test('skips existing JPEG names regardless of case and never overwrites', async t => {
  const dir = await fixture(t);
  const source = path.join(dir, 'Photo.PNG');
  const existing = path.join(dir, 'photo.JpEg');
  await makePng(source);
  await fs.writeFile(existing, 'keep me');
  const result = await convertInputs([source]);
  assert.equal(result.skipped, 1);
  assert.equal(await fs.readFile(existing, 'utf8'), 'keep me');
  await assert.rejects(fs.access(path.join(dir, 'Photo.jpg')));
});

test('scans recursively only when enabled and ignores hidden files and symlinks', async t => {
  const dir = await fixture(t);
  const nested = path.join(dir, 'nested');
  const hidden = path.join(dir, '.hidden');
  await fs.mkdir(nested);
  await fs.mkdir(hidden);
  await makePng(path.join(dir, 'root.png'));
  await makePng(path.join(nested, 'child.png'));
  await makePng(path.join(hidden, 'secret.png'));
  await fs.symlink(path.join(nested, 'child.png'), path.join(dir, 'link.png'));
  assert.equal((await collectPngs([dir], false)).length, 1);
  assert.equal((await collectPngs([dir], true)).length, 2);
});

test('deduplicates overlapping inputs and validates quality', async t => {
  const dir = await fixture(t);
  const source = path.join(dir, 'one.png');
  await makePng(source);
  const found = await collectPngs([dir, source], false);
  assert.equal(found.length, 1);
  await assert.rejects(convertInputs([source], { quality: 101 }), /1〜100/);
});
