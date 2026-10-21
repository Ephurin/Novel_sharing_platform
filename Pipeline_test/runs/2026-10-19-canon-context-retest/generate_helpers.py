import json
from pathlib import Path

run_dir = Path(__file__).resolve().parent
chapters = json.loads((run_dir / 'chapters_data.json').read_text(encoding='utf-8'))

lines = [
    "window.setReactVal = function(el, val) {",
    "  const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;",
    "  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;",
    "  setter.call(el, val);",
    "  el.dispatchEvent(new Event('input', { bubbles: true }));",
    "  el.dispatchEvent(new Event('change', { bubbles: true }));",
    "};",
    "",
    "window.fillChapter = function(key) {",
    "  const ch = window.FIXTURE_CHAPTERS[key];",
    "  if (!ch) throw new Error('Unknown chapter key: ' + key);",
    "  const titleInput = document.querySelector('input[placeholder*=\"tiêu đề\"]');",
    "  const bodyInput = document.querySelector('textarea[placeholder*=\"Bắt đầu câu\"]');",
    "  if (!titleInput || !bodyInput) throw new Error('Inputs not found on page');",
    "  window.setReactVal(titleInput, ch.title);",
    "  window.setReactVal(bodyInput, ch.body);",
    "  return { key: key, title: ch.title, wordCount: ch.body.trim().split(/\\s+/).length };",
    "};",
    "",
    "window.clickNewChapter = function() {",
    "  const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Thêm chương mới'));",
    "  if (!btn) throw new Error('Button Thêm chương mới not found');",
    "  btn.click();",
    "};",
    "",
    f"window.FIXTURE_CHAPTERS = {json.dumps(chapters, ensure_ascii=False)};",
    "console.log('FIXTURE_CHAPTERS loaded successfully.');"
]

(run_dir / 'inject_chapters.js').write_text('\n'.join(lines), encoding='utf-8')
print('Generated inject_chapters.js successfully.')
