import test from 'node:test';
import assert from 'node:assert/strict';
import { imageExtension } from './media.routes.js';
test('image uploads reject HTML, SVG and fake extensions by inspecting bytes', () => {
  for (const text of ['<svg onload="alert(1)"></svg>', '<html>not a JPEG</html>', '', 'data:image/png;base64,anything']) assert.throws(() => imageExtension(Buffer.from(text)));
  assert.equal(imageExtension(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6r8AAAAASUVORK5CYII=', 'base64')), 'png');
});
