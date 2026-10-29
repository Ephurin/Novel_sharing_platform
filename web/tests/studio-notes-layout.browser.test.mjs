import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

test('Notes preserve manuscript geometry, wrapping, scroll, selection, history and autosave across responsive layouts', { timeout: 240000 }, async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'storycraft-notes-layout-'));
  const styles = await postcss([tailwindcss(), autoprefixer()]).process(await readFile(new URL('../src/styles.css', import.meta.url), 'utf8'), { from: fileURLToPath(new URL('../src/styles.css', import.meta.url)) });
  const bundle = await build({ stdin: { contents: "import '@fontsource/be-vietnam-pro/400.css';import '@fontsource/be-vietnam-pro/600.css';import '@fontsource-variable/material-symbols-outlined/full.css';import './tests/fixtures/author-ide-fixture.tsx';", resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'tsx' }, loader: { '.woff': 'dataurl', '.woff2': 'dataurl' }, bundle: true, write: false, outfile: 'app.js', format: 'iife', jsx: 'automatic', define: { 'import.meta.env.VITE_API_BASE_URL': '"/api/v1"', 'process.env.NODE_ENV': '"test"' } });
  const server = createServer((req, res) => { res.setHeader('Content-Type', req.url === '/app.js' ? 'text/javascript' : req.url === '/app.css' ? 'text/css' : 'text/html;charset=utf-8'); res.end(req.url === '/app.js' ? bundle.outputFiles.find(file => file.path.endsWith('.js')).contents : req.url === '/app.css' ? styles.css + '\n' + bundle.outputFiles.find(file => file.path.endsWith('.css')).text : '<!doctype html><html lang="vi"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body class="sc-author-theme"><div id="root"></div><script src="/app.js"></script></body></html>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); let browser;
  try {
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
    for (const width of [1920, 1440, 1024, 768]) for (const dark of [false, true]) {
      const sourceMode = width === 1024 && dark, reduced = width === 768;
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
      const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
      const initial = Array.from({length:70}, (_,i) => `Đoạn ${i+1}. Ánh trăng soi xuống con đường vắng. An và Bình dừng lại, lắng nghe tiếng gió qua rừng cây. Một câu chuyện mới đang chờ ở phía trước.`).join('\n\n');
      let saved = initial, version = 1, patches = 0;
      const chapter = () => ({chapterId:'chapter-1',novelId:'novel-1',title:'Chương thử',chapterNumber:1,status:'DRAFT',content:saved,isVip:false,priceCoins:0,draftVersion:version,draft:{content:saved,title:'Chương thử',version}});
      const second = {chapterId:'chapter-2',novelId:'novel-1',title:'Chương khác',chapterNumber:2,status:'DRAFT',content:'Nội dung chương khác.',isVip:false,priceCoins:0,draftVersion:1};
      await page.addInitScript(({sourceMode}) => {localStorage.setItem('storycraft-studio-editor-mode',sourceMode?'source':'visual');window.testConfig={accounts:[{token:'fixture-token',userId:'author-1',novelId:'novel-1',chapterIds:['chapter-1','chapter-2']}]};},{sourceMode});
      await page.route('**/api/v1/**', async route => {
        const url = new URL(route.request().url()); let data=[];
        if(url.pathname.endsWith('/novels/me')) data=[{novelId:'novel-1',title:'Truyện thử'}];
        else if(url.pathname.endsWith('/novels/novel-1/chapters')) data=[chapter(),second];
        else if(url.pathname.endsWith('/novels/novel-1')) data={novelId:'novel-1',title:'Truyện thử'};
        else if(url.pathname.endsWith('/chapters/chapter-1')) {
          if(route.request().method()==='PATCH') { const body=route.request().postDataJSON();assert.equal(body.expectedVersion,version);saved=body.content;version++;patches++; }
          data=chapter();
        } else if(url.pathname.endsWith('/chapters/chapter-2')) data=second;
        await route.fulfill({json:{data,meta:{totalPages:1}}});
      });
      const name = `${width}-${dark?'dark':'light'}-${sourceMode?'source':'visual'}`;
      try {
        await page.goto('http://127.0.0.1:'+server.address().port);await page.evaluate(()=>document.fonts.ready);
        if(dark) await page.evaluate(()=>window.setTheme('dark'));
        const canonical=page.locator('textarea.sc-manuscript'), editor=sourceMode?canonical:page.locator('[data-studio-rich-editor]'), viewport=page.locator('.sc-editor-workspace');
        await expect(canonical).toHaveValue(initial);
        const edited=initial+'\n\nĐoạn vừa chỉnh sửa.';await editor.fill(edited);await page.keyboard.press('Control+s');await expect.poll(()=>saved).toBe(edited);
        await canonical.evaluate(el=>{const start=el.value.indexOf('Đoạn 30.');if(el.hidden) el.dispatchEvent(new CustomEvent('studio-select-source',{detail:{start,end:start+8},cancelable:true}));else{el.focus();el.setSelectionRange(start,start+8);el.dispatchEvent(new Event('select',{bubbles:true}));}});
        if(sourceMode) await viewport.evaluate(el=>{el.scrollTop=3000;});
        await viewport.evaluate(el=>{el.scrollTop+=80;});
        await editor.evaluate(el=>{window.layoutEditor=el;});
        const geometry=()=>page.evaluate(()=>{
          const workspace=document.querySelector('.sc-editor-workspace'), page=document.querySelector('.sc-manuscript-page'), source=document.querySelector('textarea.sc-manuscript'), editor=document.querySelector('[data-studio-rich-editor]')??source, toolbar=document.querySelector('.sc-format-toolbar');
          const box=element=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
          return {page:box(page),editor:box(editor),toolbar:box(toolbar),scroll:workspace.scrollTop,scrollHeight:workspace.scrollHeight,start:source.selectionStart,end:source.selectionEnd,sameNode:window.layoutEditor===editor};
        });
        const before=await geometry(), beforePatches=patches;
        assert.ok(before.page.width<=760);assert.ok(before.scroll>0);
        await page.screenshot({path:path.join(output,`${name}-closed.png`)});
        await page.getByRole('button',{name:'Ghi chú',exact:true}).click();
        const notes=page.getByRole('complementary',{name:'Ghi chú chương',exact:true});await expect(notes).toBeVisible();
        await expect(notes).toHaveCSS('opacity','1');
        const checkStable = async () => {
          const after=await geometry();
          for(const area of ['page','editor','toolbar']) for(const key of ['x','y','width','height']) assert.ok(Math.abs(before[area][key]-after[area][key])<.5,`${name}: ${area}.${key} changed ${before[area][key]} -> ${after[area][key]}`);
          assert.equal(after.scroll,before.scroll);assert.equal(after.scrollHeight,before.scrollHeight);assert.equal(after.start,before.start);assert.equal(after.end,before.end);assert.equal(after.sameNode,true);await expect(canonical).toHaveValue(edited);
        };
        await checkStable();
        const notesBox=await notes.boundingBox(), toolbarBox=await page.locator('.sc-format-toolbar').boundingBox();
        if(width===1920) { assert.ok(notesBox.x>=before.page.x+before.page.width);await expect(notes).toHaveCSS('box-shadow','none'); }
        else assert.ok(notesBox.y>=toolbarBox.y+toolbarBox.height,`${name}: drawer covers formatting controls`);
        if(reduced) await expect(notes).toHaveCSS('transition-duration','0s');
        await page.getByRole('tab',{name:'Sổ tay chương',exact:true}).click();await page.getByRole('textbox',{name:'Ghi chú riêng',exact:true}).fill('Ý tưởng riêng cho chương một.');
        await page.screenshot({path:path.join(output,`${name}-open.png`)});
        await page.getByRole('button',{name:'Đóng công cụ',exact:true}).click();await expect(notes).toBeHidden();await expect(editor).toBeFocused();await checkStable();
        assert.equal(patches,beforePatches,'Toggling Notes must not edit or autosave the manuscript');
        await page.keyboard.press('Control+z');await expect(canonical).toHaveValue(initial);await page.keyboard.press('Control+Shift+z');await expect(canonical).toHaveValue(edited);
        await page.keyboard.press('Control+s');await expect.poll(()=>saved).toBe(edited);
        if(width<=900) await page.getByTitle('Đóng/Mở thanh danh sách chương',{exact:true}).click();
        await page.locator('.sc-studio-sidebar').getByText('Chương khác',{exact:true}).click();await expect(canonical).toHaveValue(second.content);
        if(width<=900) await page.getByTitle('Đóng/Mở thanh danh sách chương',{exact:true}).click();
        await page.getByRole('button',{name:'Ghi chú',exact:true}).click();await page.getByRole('tab',{name:'Sổ tay chương',exact:true}).click();await expect(page.getByRole('textbox',{name:'Ghi chú riêng',exact:true})).toHaveValue('');
        await page.getByRole('button',{name:'Đóng công cụ',exact:true}).click();
        if(width<=900) await page.getByTitle('Đóng/Mở thanh danh sách chương',{exact:true}).click();
        await page.locator('.sc-studio-sidebar').getByText('Chương thử',{exact:true}).click();await expect(canonical).toHaveValue(edited);
        if(width<=900) await page.getByTitle('Đóng/Mở thanh danh sách chương',{exact:true}).click();
        await page.getByRole('button',{name:'Ghi chú',exact:true}).click();await page.getByRole('tab',{name:'Sổ tay chương',exact:true}).click();await expect(page.getByRole('textbox',{name:'Ghi chú riêng',exact:true})).toHaveValue('Ý tưởng riêng cho chương một.');
        assert.deepEqual(errors,[]);console.log('Stable Notes:',name);
      } catch(error) {await page.screenshot({path:path.join(output,`${name}-failure.png`)});console.log('Layout screenshots:',output);throw error;} finally {await context.close();}
    }
    console.log('Layout screenshots:',output);
  } finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
