// Every reading gets its own picture.
//
// The interface carries no words, so the glyph is the label. Two readings
// sharing one glyph is the same defect as two fields sharing one name — and it
// happened: sea temperature and the wind chill on exit both drew a plain
// thermometer, distinguishable only by their accessible names.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('public/index.html', 'utf8');
const app = readFileSync('public/app.js', 'utf8');

/** Glyph ids referenced by the tiles the card renders. */
const tileGlyphs = [...app.matchAll(/tile\('([a-z-]+)'/g)].map((m) => m[1]);

test('the card renders more than one reading', () => {
  assert.ok(tileGlyphs.length >= 4, `found ${tileGlyphs.length} tiles`);
});

test('no two readings share a glyph', () => {
  const seen = new Map();
  for (const glyph of tileGlyphs) seen.set(glyph, (seen.get(glyph) ?? 0) + 1);
  const shared = [...seen].filter(([, n]) => n > 1).map(([g]) => g);
  assert.deepEqual(shared, [], `glyph reused across readings: ${shared.join(', ')}`);
});

test('every glyph a tile asks for is actually defined', () => {
  // A missing symbol renders as nothing at all, leaving a number with no label
  // in an interface where the label is the only thing naming it.
  for (const glyph of tileGlyphs) {
    assert.match(html, new RegExp(`id="g-${glyph}"`), `no symbol for g-${glyph}`);
  }
});

test('every symbol referenced anywhere is defined', () => {
  const used = new Set([...html.matchAll(/href="#(g-[a-z-]+)"/g)].map((m) => m[1]));
  used.forEach((id) => assert.match(html, new RegExp(`id="${id}"`), `no symbol for ${id}`));
});

test('glyphs referenced by name at runtime exist', () => {
  // Built from templates — `#g-${glyph}` for the tiles, `#g-${sky}` for the
  // weather — so no scan of the source can see them. A symbol that is not there
  // renders as empty space rather than failing.
  const app = readFileSync('public/app.js', 'utf8');
  const skies = ['sun', 'moon', 'suncloud', 'cloud', 'rain', 'snow', 'fog', 'storm'];
  for (const id of skies) {
    assert.match(html, new RegExp(`id="g-${id}"`), `no symbol for g-${id}`);
  }
  assert.match(app, /#g-\$\{sky\}/, 'the weather glyph should be chosen at runtime');
});

test('no symbol is defined that nothing uses', () => {
  // Dead artwork is easy to leave behind when a row is rearranged: removing the
  // glyphs flanking the tide times orphaned three symbols at once.
  const app = readFileSync('public/app.js', 'utf8');
  const defined = [...html.matchAll(/id="(g-[a-z-]+)"/g)].map((m) => m[1]);
  const orphans = defined.filter((id) => {
    const bare = id.replace(/^g-/, '');
    return !html.includes(`#${id}"`)
      && !app.includes(`#${id}"`)
      && !app.includes(`'${bare}'`)
      && !(['sun', 'moon', 'suncloud', 'cloud', 'rain', 'snow', 'fog', 'storm'].includes(bare));
  });
  assert.deepEqual(orphans, [], `symbols nothing references: ${orphans.join(', ')}`);
});

test('the sky glyphs are all drawn on the same viewBox', () => {
  // They stand in for one another in the same slot, so a different box would
  // make the weather appear to change size when it changes state.
  const boxes = ['g-sun', 'g-cloud', 'g-rain', 'g-storm'].map((id) => {
    const found = html.match(new RegExp(`id="${id}" viewBox="([^"]+)"`));
    assert.ok(found, `${id} has no viewBox`);
    return found[1];
  });
  assert.equal(new Set(boxes).size, 1, `mismatched viewBoxes: ${boxes.join(' / ')}`);
});

test('no reading still relies on an inline style for its glyph size', () => {
  // Sizes belong in the stylesheet; an inline one silently wins over it later.
  const app = readFileSync('public/app.js', 'utf8');
  assert.doesNotMatch(app, /<svg[^>]*style="[^"]*width:/, 'glyph sized inline');
});

test('every buoy variant named in the code is drawn and registered', () => {
  // The style asks for the icon by a data property rather than by name, so a
  // variant that nothing registers cannot be spotted by reading the style — it
  // just draws nothing where a buoy should be.
  const app = readFileSync('public/app.js', 'utf8');
  const style = readFileSync('public/map-style.js', 'utf8');
  const named = [...style.matchAll(/'(buoy-[a-z]+)'/g)].map((m) => m[1]);
  assert.ok(named.length >= 2, `found ${named.length} buoy variants`);
  for (const variant of named) {
    assert.match(app, new RegExp(`'${variant}'`), `nothing draws the "${variant}" icon`);
  }
});

test('nothing is registered twice', () => {
  // A stray duplicate of a top-level block is not a syntax error when the
  // copies land in different scopes, so it survives a parse and quietly
  // doubles up.
  const app = readFileSync('public/app.js', 'utf8');
  const handlers = app.match(/map\.on\('styleimagemissing'/g) ?? [];
  assert.equal(handlers.length, 1, `${handlers.length} styleimagemissing handlers`);
  const art = app.match(/^const buoyArt =/gm) ?? [];
  assert.equal(art.length, 1, `${art.length} buoy artwork definitions`);
});
