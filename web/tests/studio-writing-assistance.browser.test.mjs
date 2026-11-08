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

test('writing assistance: labels, anchored bookmarks, explicit proofreading, chapter search and position restoration', { timeout: 240000 }, async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'storycraft-writing-assistance-'));
  const styles = await postcss([tailwindcss(), autoprefixer()]).process(await readFile(new URL('../src/styles.css', import.meta.url), 'utf8'), { from: fileURLToPath(new URL('../src/styles.css', import.meta.url)) });
  const bundle = await build({ stdin: { contents: "import '@fontsource/be-vietnam-pro/400.css';import '@fontsource/be-vietnam-pro/600.css';import '@fontsource-variable/material-symbols-outlined/full.css';import './tests/fixtures/author-ide-fixture.tsx';", resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'tsx' }, loader: { '.woff': 'dataurl', '.woff2': 'dataurl' }, bundle: true, write: false, outfile: 'app.js', format: 'iife', jsx: 'automatic', define: { 'import.meta.env.VITE_API_BASE_URL': '"/api/v1"', 'process.env.NODE_ENV': '"test"' } });
  const server = createServer((req, res) => { res.setHeader('Content-Type', req.url === '/app.js' ? 'text/javascript' : req.url === '/app.css' ? 'text/css' : 'text/html;charset=utf-8'); res.end(req.url === '/app.js' ? bundle.outputFiles.find(file => file.path.endsWith('.js')).contents : req.url === '/app.css' ? styles.css + '\n' + bundle.outputFiles.find(file => file.path.endsWith('.css')).text : '<!doctype html><html lang="vi"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body class="sc-author-theme"><div id="root"></div><script src="/app.js"></script></body></html>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); let browser;
  try {
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
    for (const profile of [{width:1920,dark:false,source:false},{width:1280,dark:true,source:true},{width:390,dark:true,source:false}]) {
      const context = await browser.newContext({viewport:{width:profile.width,height:1000},reducedMotion:profile.dark?'reduce':'no-preference'}), page=await context.newPage(), errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      const marker='Mốc bình minh', paragraphs=Array.from({length:45},(_,index)=>`${index===25?marker:`Đoạn ${index+1}`}. Ánh trăng soi xuống con đường vắng. An và Bình lắng nghe tiếng gió, chờ một câu chuyện mới.`).join('\n\n');
      const initial='An  mở cửa ,Bình nói...  \n\n'+paragraphs+'\n\nCuối  chương!', corrected='An mở cửa, Bình nói…\n\n'+paragraphs+'\n\nCuối chương!';
      let value=initial, version=1, patches=0, failThird=true;
      const chapter=()=>({chapterId:'chapter-1',novelId:'novel-1',title:'Chương một',chapterNumber:1,status:'DRAFT',content:value,draftVersion:version,isVip:false,priceCoins:0,draft:{content:value,title:'Chương một',version}});
      const second={chapterId:'chapter-2',novelId:'novel-1',title:'Chương hai',chapterNumber:2,status:'PUBLISHED',content:'Bản công khai không chứa từ cần tìm.',isVip:false,priceCoins:0,draftVersion:1,draft:{title:'Bản nháp chương hai',content:'Một bí mật vẫn còn trong bản nháp.',version:1}};
      const third={chapterId:'chapter-3',novelId:'novel-1',title:'Chương ba',chapterNumber:3,status:'DRAFT',content:'Không có từ khóa.',isVip:false,priceCoins:0};
      await page.addInitScript(source=>{window.testConfig={accounts:[{token:'fixture',userId:'author-1',novelId:'novel-1',chapterIds:['chapter-1','chapter-2','chapter-3']}]};localStorage.setItem('storycraft-studio-editor-mode',source?'source':'visual');},profile.source);
      const mock=async route=>{
        const pathname=new URL(route.request().url()).pathname;let data=[];
        if(pathname.endsWith('/novels/me'))data=[{novelId:'novel-1',title:'Truyện thử'}];
        else if(pathname.endsWith('/novels/novel-1/chapters'))data=[chapter(),{...second,content:null,draft:null},third];
        else if(pathname.endsWith('/novels/novel-1'))data={novelId:'novel-1',title:'Truyện thử'};
        else if(pathname.endsWith('/chapters/chapter-1')){if(route.request().method()==='PATCH'){value=route.request().postDataJSON().content;version++;patches++;}data=chapter();}
        else if(pathname.endsWith('/chapters/chapter-2'))data=second;
        else if(pathname.endsWith('/chapters/chapter-3')){if(failThird)return route.fulfill({status:403,json:{error:{message:'Không có quyền đọc chương này'}}});data=third;}
        await route.fulfill({json:{data,meta:{totalPages:1}}});
      };
      await context.route('**/api/v1/**',mock);
      const url='http://127.0.0.1:'+server.address().port, name=`${profile.width}-${profile.source?'source':'visual'}-${profile.dark?'dark':'light'}`;
      try {
        await page.goto(url);if(profile.dark)await page.evaluate(()=>window.setTheme('dark'));
        const canonical=page.locator('textarea.sc-manuscript'),editor=profile.source?canonical:page.locator('[data-studio-rich-editor]'),notes=page.getByRole('complementary',{name:'Ghi chú chương',exact:true}),viewport=page.locator('.sc-editor-workspace');
        await expect(canonical).toHaveValue(initial);
        const select=async(start,end,scroll=true)=>canonical.evaluate((el,range)=>{if(el.hidden)el.dispatchEvent(new CustomEvent('studio-select-source',{detail:range,cancelable:true}));else{el.focus({preventScroll:true});el.setSelectionRange(range.start,range.end);el.dispatchEvent(new Event('select',{bubbles:true}));}}, {start,end,scroll});
        await select(0,2);await page.keyboard.press('Control+Alt+m');await notes.getByRole('combobox',{name:'Nhãn ghi chú',exact:true}).selectOption('plot');await notes.getByRole('textbox',{name:'Nội dung ghi chú đoạn',exact:true}).fill('Giữ chi tiết mở đầu');await notes.getByRole('button',{name:'Lưu ghi chú đoạn',exact:true}).click();
        await notes.getByRole('combobox',{name:'Lọc nhãn ghi chú',exact:true}).selectOption('character');await expect(notes.getByRole('textbox',{name:'Sửa ghi chú đoạn',exact:true})).toHaveCount(0);
        await notes.getByRole('combobox',{name:'Lọc nhãn ghi chú',exact:true}).selectOption('plot');await expect(notes.getByRole('textbox',{name:'Sửa ghi chú đoạn',exact:true})).toHaveValue('Giữ chi tiết mở đầu');await notes.getByRole('button',{name:'Đóng công cụ',exact:true}).click();
        const at=initial.indexOf(marker);await select(at,at+marker.length);if(profile.source)await viewport.evaluate(el=>{el.scrollTop=el.scrollHeight*.5;});
        await page.getByRole('button',{name:'Xem',exact:true}).click();await page.getByRole('menuitem',{name:'Đánh dấu đoạn văn',exact:true}).click();await notes.getByRole('button',{name:'Đánh dấu vùng chọn / dòng hiện tại',exact:true}).click();
        await notes.getByRole('textbox',{name:'Tên đánh dấu',exact:true}).fill('Cảnh bước ngoặt');await notes.getByRole('button',{name:'Lưu đánh dấu',exact:true}).click();await expect(notes.getByRole('textbox',{name:'Đổi tên đánh dấu',exact:true})).toHaveValue('Cảnh bước ngoặt');
        const beforePatches=patches;await notes.getByRole('button',{name:'Tới đánh dấu',exact:true}).click();assert.equal(await canonical.evaluate(el=>el.selectionStart),at);assert.equal(patches,beforePatches,'Labels and bookmarks must not save prose');await notes.getByRole('button',{name:'Đóng công cụ',exact:true}).click();
        await page.getByRole('button',{name:'Xem',exact:true}).click();await page.getByRole('menuitem',{name:'Kiểm tra dấu câu & khoảng trắng',exact:true}).click();
        let proof=page.getByRole('dialog',{name:'Kiểm tra dấu câu & khoảng trắng',exact:true});await expect(proof).toBeVisible();await expect(canonical).toHaveValue(initial);
        await proof.getByRole('combobox',{name:'Loại lỗi trình bày',exact:true}).selectOption('beforePunctuation');await proof.getByRole('button',{name:/Áp dụng các đề xuất đang hiện/}).click();await expect(canonical).toHaveValue(initial.replace(' ,',','));await page.keyboard.press('Escape');await editor.focus();await page.keyboard.press('Control+z');await expect(canonical).toHaveValue(initial);
        await page.getByRole('button',{name:'Xem',exact:true}).click();await page.getByRole('menuitem',{name:'Kiểm tra dấu câu & khoảng trắng',exact:true}).click();proof=page.getByRole('dialog',{name:'Kiểm tra dấu câu & khoảng trắng',exact:true});await expect(proof).toHaveCSS('opacity','1');await page.screenshot({path:path.join(output,name+'-proofreading.png')});await proof.getByRole('button',{name:/Áp dụng các đề xuất đang hiện/}).click();await expect(canonical).toHaveValue(corrected);await page.keyboard.press('Escape');
        await page.getByRole('button',{name:'Xem',exact:true}).click();await page.getByRole('menuitem',{name:'Đánh dấu đoạn văn',exact:true}).click();await notes.getByRole('button',{name:'Tới đánh dấu',exact:true}).click();assert.equal(await canonical.evaluate(el=>el.selectionStart),corrected.indexOf(marker));await expect(notes.getByText(/Đoạn gốc đã thay đổi/)).toHaveCount(0);await notes.getByRole('button',{name:'Đóng công cụ',exact:true}).click();await editor.focus();await page.keyboard.press('Control+z');await expect(canonical).toHaveValue(initial);
        await page.keyboard.press('Control+s');await expect.poll(()=>value).toBe(initial);
        await select(at,at+marker.length);await viewport.evaluate(el=>{el.scrollTop=el.scrollHeight*.45;});const position=await viewport.evaluate(el=>el.scrollTop);
        await expect.poll(()=>page.evaluate(()=>{const value=JSON.parse(localStorage.getItem('storycraft-studio-position:author-1:chapter-1')??'null');return value?.scroll;})).toBe(position);
        await page.reload();if(profile.dark)await page.evaluate(()=>window.setTheme('dark'));await expect(canonical).toHaveValue(initial);await expect.poll(()=>viewport.evaluate(el=>el.scrollTop)).toBe(position);await expect.poll(()=>canonical.evaluate(el=>el.selectionStart)).toBe(at);
        const sidebar=page.locator('.sc-studio-sidebar');if(profile.width<=900)await page.getByTitle('Đóng/Mở thanh danh sách chương',{exact:true}).click();await sidebar.getByText('Chương hai',{exact:true}).click();await expect(canonical).toHaveValue(second.draft.content);await sidebar.getByText('Chương một',{exact:true}).click();await expect(canonical).toHaveValue(initial);await expect.poll(()=>canonical.evaluate(el=>el.selectionStart)).toBe(at);await expect.poll(()=>viewport.evaluate(el=>el.scrollTop)).toBe(position);
        if(profile.width<=900)await page.getByTitle('Đóng/Mở thanh danh sách chương',{exact:true}).click();
        await page.getByRole('button',{name:'Ghi chú',exact:true}).click();await expect(notes.getByRole('combobox',{name:'Đổi nhãn ghi chú',exact:true})).toHaveValue('plot');await notes.getByRole('tab',{name:'Đánh dấu',exact:true}).click();await expect(notes.getByRole('textbox',{name:'Đổi tên đánh dấu',exact:true})).toHaveValue('Cảnh bước ngoặt');await page.screenshot({path:path.join(output,name+'-bookmarks.png')});await notes.getByRole('button',{name:'Đóng công cụ',exact:true}).click();
        await editor.fill(initial+'\n\nMột bí mật chưa lưu.');await editor.focus();await page.keyboard.press('Control+Shift+f');const search=page.getByRole('dialog',{name:'Tìm xuyên chương',exact:true});await expect(search).toBeVisible();await search.getByRole('searchbox',{name:'Tìm trong toàn truyện',exact:true}).fill('bí mật');await search.getByRole('button',{name:'Tìm toàn truyện',exact:true}).click();await expect(search.getByRole('button',{name:'Tìm toàn truyện',exact:true})).toBeEnabled();
        await expect(search.locator('.sc-novel-search-hit')).toHaveCount(2);await expect(search.getByRole('alert')).toContainText('Chương ba');failThird=false;await search.getByRole('button',{name:'Tìm toàn truyện',exact:true}).click();await expect(search.getByRole('button',{name:'Tìm toàn truyện',exact:true})).toBeEnabled();await expect(search.getByRole('alert')).toHaveCount(0);await page.screenshot({path:path.join(output,name+'-novel-search.png')});
        await search.locator('.sc-novel-search-hit').filter({hasText:'Bản nháp chương hai'}).click();
        await page.waitForFunction(expected=>document.querySelector('textarea.sc-manuscript')?.value===expected||Array.from(document.querySelectorAll('button')).some(button=>button.textContent==='Lưu và rời trang'),second.draft.content);
        const saveAndLeave=page.getByRole('button',{name:'Lưu và rời trang',exact:true});if(await saveAndLeave.isVisible())await saveAndLeave.click();
        await expect(canonical).toHaveValue(second.draft.content);await expect.poll(()=>canonical.evaluate(el=>el.value.slice(el.selectionStart,el.selectionEnd))).toBe('bí mật');
        const other=await context.newPage();await other.addInitScript(()=>{window.testConfig={accounts:[{token:'fixture',userId:'author-2',novelId:'novel-1',chapterIds:['chapter-1']}]};});await other.goto(url);await expect(other.locator('textarea.sc-manuscript')).toHaveValue(value);await expect.poll(()=>other.locator('textarea.sc-manuscript').evaluate(el=>el.selectionStart)).toBe(0);assert.equal(await other.locator('.sc-editor-workspace').evaluate(el=>el.scrollTop),0);await other.close();
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);console.log('Writing assistance:',name);
      } catch(error){await page.screenshot({path:path.join(output,name+'-failure.png')});console.log('Screenshots:',output);throw error;}
      finally{await context.close();}
    }
    console.log('Screenshots:',output);
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
