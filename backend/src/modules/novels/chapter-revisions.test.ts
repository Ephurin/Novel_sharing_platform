import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { applyPatchToContent } from './chapter-revisions.service.js';
import { AppError } from '../../core/errors/app-error.js';

describe('Chapter Revisions & Patch Application', () => {
  test('applyPatchToContent correctly applies insertion at cursor', () => {
    const original = 'Tiêu Viêm thở dài một hơi.';
    const patch = {
      start: 10,
      end: 10,
      replacement: 'khẽ '
    };
    const result = applyPatchToContent(original, patch);
    assert.equal(result, 'Tiêu Viêm khẽ thở dài một hơi.');
  });

  test('applyPatchToContent correctly replaces selection range', () => {
    const original = 'Trời đổ cơn mưa rào mùa hạ.';
    const phrase = 'mưa rào';
    const start = original.indexOf(phrase);
    const end = start + phrase.length;

    const patch = {
      start,
      end,
      replacement: 'tuyết trắng mùa đông'
    };
    const result = applyPatchToContent(original, patch);
    assert.equal(result, 'Trời đổ cơn tuyết trắng mùa đông mùa hạ.');
  });

  test('applyPatchToContent handles unicode code points without splitting multi-byte characters', () => {
    const original = 'Tiêu Viêm 🔥 kịch chiến Hải Ba Đông ❄️ tại sa mạc.';
    const patch = {
      start: 0,
      end: Array.from('Tiêu Viêm').length,
      replacement: 'Viêm Đế'
    };
    const result = applyPatchToContent(original, patch);
    assert.equal(result.startsWith('Viêm Đế 🔥'), true);
  });

  test('applyPatchToContent REJECTS out-of-bounds start or end with 422 (no silent clamping)', () => {
    const original = 'Xin chào.';
    const codePointLen = Array.from(original).length; // 9

    // End beyond bounds
    assert.throws(
      () => applyPatchToContent(original, { start: 0, end: 999, replacement: 'Thay đổi' }),
      (err: any) => err instanceof AppError && err.httpStatus === 422 && err.code === 'INVALID_PATCH_BOUNDS'
    );

    // Negative start
    assert.throws(
      () => applyPatchToContent(original, { start: -1, end: 5, replacement: 'Thay đổi' }),
      (err: any) => err instanceof AppError && err.httpStatus === 422 && err.code === 'INVALID_PATCH_BOUNDS'
    );

    // Inverted bounds
    assert.throws(
      () => applyPatchToContent(original, { start: 6, end: 3, replacement: 'Thay đổi' }),
      (err: any) => err instanceof AppError && err.httpStatus === 422 && err.code === 'INVALID_PATCH_BOUNDS'
    );

    // Non-integer offsets
    assert.throws(
      () => applyPatchToContent(original, { start: 1.5, end: 5, replacement: 'Thay đổi' }),
      (err: any) => err instanceof AppError && err.httpStatus === 422 && err.code === 'INVALID_PATCH_BOUNDS'
    );
  });

  test('applyPatchToContent allows valid boundary edge cases (0 to length)', () => {
    const original = 'Văn bản gốc.';
    const len = Array.from(original).length;

    // Full replacement from 0 to len
    const replaced = applyPatchToContent(original, { start: 0, end: len, replacement: 'Toàn bộ mới.' });
    assert.equal(replaced, 'Toàn bộ mới.');

    // Append at end
    const appended = applyPatchToContent(original, { start: len, end: len, replacement: ' Thêm cuối.' });
    assert.equal(appended, 'Văn bản gốc. Thêm cuối.');

    // Prepend at 0
    const prepended = applyPatchToContent(original, { start: 0, end: 0, replacement: 'Đầu: ' });
    assert.equal(prepended, 'Đầu: Văn bản gốc.');
  });
});
