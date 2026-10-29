import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';

test('navigation enhancements: filters, reorder, highlights, images, reactions and reader tools', { timeout: 180000 }, async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'storycraft-navigation-'));
  const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { host: '127.0.0.1', port: 0 },
    plugins: [{ name: 'navigation-test', configureServer(vite) {
      vite.middlewares.use('/__navigation_test', async (req, res, next) => {
        if (req.url.includes('?')) return next();
        try {
          res.setHeader('Content-Type', 'text/html');
          res.end(await vite.transformIndexHtml('/__navigation_test', `<!doctype html><html lang="vi"><head>
            <meta name="viewport" content="width=device-width,initial-scale=1"><script src="/theme-init.js"></script>
            <style>.material-symbols-outlined{font-family:'Material Symbols Outlined Variable';font-size:18px;line-height:1}</style>
            </head><body><div id="root"></div><script type="module">
            import React, { useState } from 'react'; import { createRoot } from 'react-dom/client';
            import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
            import { Button, Select, TextInput } from '@mantine/core';
            import { AppProviders } from '/src/app/providers.tsx';
            import { ResponsiveFilters, ImageLightbox, SelectionToolbar, useUpdatedItems } from '/src/shared/components/InteractionWidgets.tsx';
            import { ThemeControl } from '/src/shared/components/ThemeControl.tsx';
            import { ChapterOrder } from '/src/features/author-projects/ChapterActions.tsx';
            import { NovelEngagement } from '/src/features/reader/NovelEngagement.tsx';
            import { ReaderChapterPage, PublicReaderChapterPage } from '/src/features/reader/ReaderPage.tsx';
            import { useAuthStore } from '/src/features/auth/useAuthStore.ts';
            import '@fontsource/be-vietnam-pro/400.css'; import '@fontsource/be-vietnam-pro/500.css';
            import '@fontsource-variable/material-symbols-outlined/full.css'; import '/src/styles.css'; import '/src/theme/color-mode.css';
            const h=React.createElement;
            const image='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="150"%3E%3Crect width="100" height="150" fill="%23dd8567"/%3E%3C/svg%3E';
            const chapters=[1,2,3].map(n=>({chapterId:'c-'+n,novelId:'novel-test',title:'Chương '+n,chapterNumber:n,status:'DRAFT',isVip:false,priceCoins:0}));
            useAuthStore.getState().setSession({accessToken:'test',user:{userId:'reader-test',username:'tester',email:'test@example.invalid',role:'READER',status:'ACTIVE'}});
            function Demo(){
              const [q,setQ]=useState(''),[status,setStatus]=useState('all'),[order,setOrder]=useState(false),[count,setCount]=useState(0),[version,setVersion]=useState(1),[scope,setScope]=useState('first');
              const updated=useUpdatedItems([{id:'row',version:String(version)}],scope);
              return h('main',{style:{padding:24,maxWidth:900,margin:'auto'}},
                h(ThemeControl),h(ResponsiveFilters,null,h(TextInput,{label:'Tìm truyện',value:q,onChange:e=>setQ(e.target.value)}),h(Select,{label:'Trạng thái',comboboxProps:{withinPortal:false},data:[{value:'all',label:'Tất cả'},{value:'draft',label:'Bản nháp'}],value:status,onChange:setStatus})),
                h('output',null,q+' / '+status),
                h('div',{id:'changed-record',className:updated.has('row')?'sc-item-updated':''},'Dữ liệu '+version),
                h(Button,{onClick:()=>setVersion(v=>v+1)},'Cập nhật bản ghi'),h(Button,{onClick:()=>setScope('second')},'Đổi bộ lọc'),
                h(Button,{onClick:()=>setCount(2)},'Chọn hai chương'),h(SelectionToolbar,{count,onClear:()=>setCount(0)}),
                h(Button,{onClick:()=>setOrder(true)},'Sắp xếp chương'),order&&h(ChapterOrder,{novelId:'novel-test',chapters,onClose:()=>setOrder(false)}),
                h('div',{style:{width:100,height:150,marginTop:20}},h(ImageLightbox,{src:image,alt:'Bìa thử nghiệm',className:'sc-cover-hover sc-image-preview-fill'},h('img',{src:image,alt:'Bìa thử nghiệm',style:{width:'100%',height:'100%'}}))),
                h(NovelEngagement,{novelId:'novel-test',authorId:'different-author'}),
                h('div',{style:{height:1800}},'Nội dung dài'));
            }
            const publicReader=location.pathname.endsWith('/publicreader');
            const reader=publicReader||location.pathname.endsWith('/reader');
            createRoot(document.getElementById('root')).render(h(AppProviders,null,h(MemoryRouter,{initialEntries:[publicReader?'/public/chapters/c-1':reader?'/reader/chapters/c-1':'/']},reader?h(Routes,null,h(Route,{path:publicReader?'/public/chapters/:chapterId':'/reader/chapters/:chapterId',element:h(publicReader?PublicReaderChapterPage:ReaderChapterPage)})):h(Demo))));
            </script></body></html>`));
        } catch(error){next(error);}
      });
    }}] });
  let browser;
  try {
    await server.listen();
    browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||undefined});
    const base=`http://127.0.0.1:${server.httpServer.address().port}/__navigation_test`;
    for(const mobile of [false,true]) {
      const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},reducedMotion:mobile?'reduce':'no-preference'});
      const page=await context.newPage();
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      let failFollow=true,following=false,savedOrder,preferences={fontFamily:'system-ui',fontSize:18,background:'LIGHT',lineHeight:1.8};
      await page.addInitScript(theme=>localStorage.setItem('storycraft-theme',theme),mobile?'dark':'light');
      await page.route('**/api/v1/**',async route=>{
        const url=new URL(route.request().url()),method=route.request().method();let data={};
        const stats=()=>({novelId:'novel-test',totalWords:200,followersCount:following?3:2,ratingAverage:null,ratingsCount:0,isFollowing:following,myRating:null,myReview:null});
        if(url.pathname.endsWith('/follow')){
          if(failFollow)return route.fulfill({status:403,json:{success:false,error:{message:'Không có quyền thao tác'}}});
          following=method==='PUT';data=stats();
        }else if(url.pathname.endsWith('/statistics'))data=stats();
        else if(url.pathname.endsWith('/reviews')||url.pathname.endsWith('/comments'))data=[];
        else if(url.pathname.endsWith('/chapter-order')){savedOrder=route.request().postDataJSON().chapterIds;data={};}
        else if(url.pathname.endsWith('/reading/preferences/me')){if(method==='PUT')preferences=route.request().postDataJSON();data=preferences;}
        else if(url.pathname.endsWith('/reading/novels/novel-test'))data={novelId:'novel-test',authorId:'different-author',title:'Truyện thử',chapters:[1,2,3].map(n=>({chapterId:'c-'+n,novelId:'novel-test',chapterNumber:n,title:'Chương '+n,isVip:n===3,priceCoins:n===3?10:0}))};
        else if(/\/reading\/chapters\/c-\d$/.test(url.pathname))data={chapterId:url.pathname.split('/').at(-1),novelId:'novel-test',title:'Chương thử',chapterNumber:1,content:'Một đoạn văn. '.repeat(600),isVip:false,priceCoins:0};
        return route.fulfill({json:{success:true,data,meta:{totalItems:0,totalPages:0}}});
      });
      try {
        await page.goto(base);
        const outputState=page.locator('output');
        if(mobile)await page.getByRole('button',{name:'Bộ lọc',exact:true}).click();
        await page.getByLabel('Tìm truyện').fill('Truyện mới');
        await page.getByRole('textbox',{name:'Trạng thái',exact:true}).click();
        await page.getByRole('option',{name:'Bản nháp',exact:true}).click();
        if(mobile){await page.getByRole('button',{name:'Xem kết quả',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);}
        await expect(outputState).toHaveText('Truyện mới / draft');
        if(mobile){await page.getByRole('button',{name:'Bộ lọc',exact:true}).click();await expect(page.getByLabel('Tìm truyện')).toHaveValue('Truyện mới');await page.keyboard.press('Escape');}
        await expect(page.locator('#changed-record')).not.toHaveClass(/sc-item-updated/);
        await page.getByRole('button',{name:'Cập nhật bản ghi'}).click();await expect(page.locator('#changed-record')).toHaveClass(/sc-item-updated/);
        await page.getByRole('button',{name:'Đổi bộ lọc'}).click();await expect(page.locator('#changed-record')).not.toHaveClass(/sc-item-updated/);
        await page.getByRole('button',{name:'Chọn hai chương'}).click();await expect(page.getByRole('region',{name:'Thao tác với mục đã chọn'})).toContainText('Đã chọn 2 mục');
        await page.getByRole('button',{name:'Bỏ chọn',exact:true}).click();await expect(page.getByRole('region',{name:'Thao tác với mục đã chọn'})).toHaveCount(0);

        await page.getByRole('button',{name:'Sắp xếp chương',exact:true}).click();
        const dialog=page.getByRole('dialog',{name:'Sắp xếp chương',exact:true});
        await dialog.getByRole('button',{name:'Đưa xuống: Chương 1',exact:true}).click();
        await expect(dialog.locator('[data-order-chapter]').first()).toHaveAttribute('data-order-chapter','c-2');
        await dialog.getByRole('button',{name:'Kéo để di chuyển: Chương 1'}).focus();await page.keyboard.press('ArrowDown');
        await expect(dialog.locator('[data-order-chapter]').last()).toHaveAttribute('data-order-chapter','c-1');
        await expect.poll(()=>dialog.locator('[data-order-chapter="c-2"]').evaluate(el=>getComputedStyle(el).transform)).toBe('none');
        const handle=await dialog.getByRole('button',{name:'Kéo để di chuyển: Chương 2'}).boundingBox();
        const destination=await dialog.locator('[data-order-chapter="c-1"]').boundingBox();
        await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();
        await page.mouse.move(destination.x+destination.width/2,destination.y+destination.height/2,{steps:8});
        await expect(dialog.locator('[data-order-chapter="c-1"]')).toHaveClass(/is-drop-target/);
        await page.mouse.up();
        await expect(dialog.locator('[data-order-chapter]').last()).toHaveAttribute('data-order-chapter','c-2');
        await dialog.getByRole('button',{name:'Lưu thứ tự',exact:true}).click();await expect(dialog).toHaveCount(0);assert.deepEqual(savedOrder,['c-3','c-1','c-2']);

        const image=page.getByRole('button',{name:'Phóng to Bìa thử nghiệm'});
        const before=await image.boundingBox();await image.hover();
        if(!mobile)await expect.poll(()=>image.locator('img').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).a)).toBeGreaterThan(1);
        assert.deepEqual(await image.boundingBox(),before);
        await image.click();await expect(page.getByRole('dialog',{name:'Bìa thử nghiệm'})).toBeVisible();await expect(page.locator('.sc-lightbox-image')).toBeVisible();
        await page.keyboard.press('Escape');await expect(image).toBeFocused();

        const follow=page.getByRole('button',{name:'Theo dõi truyện',exact:true});await follow.click();
        await expect(page.getByRole('alert')).toContainText('Không có quyền thao tác');await expect(follow).toBeVisible();assert.equal(await follow.locator('.sc-reaction-icon').getAttribute('data-active'),null);
        failFollow=false;await follow.click();await expect(page.getByRole('button',{name:'Bỏ theo dõi truyện'})).toBeVisible();await expect(page.locator('.sc-reaction-icon[data-active]')).toHaveCount(1);
        await page.getByRole('button',{name:'Giao diện',exact:true}).click();await page.getByRole('menuitem',{name:mobile?'Sáng':'Tối',exact:true}).click();
        await expect(page.locator('html')).toHaveAttribute('data-theme',mobile?'light':'dark');await expect(page.locator('.sc-theme-icon > span')).toHaveCount(1);
        await expect(page.getByRole('menu')).toHaveCount(0);
        await page.evaluate(()=>scrollTo(0,1200));await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(500);
        await page.getByRole('button',{name:'Về đầu trang',exact:true}).click();await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);
        await page.screenshot({path:path.join(output,`${mobile?'mobile':'desktop'}-widgets.png`)});

        await page.goto(base+'/reader');
        await page.getByRole('button',{name:'Mục lục',exact:true}).click();
        const toc=page.getByRole('dialog',{name:'Mục lục chương'});await expect(toc.locator('[aria-current="page"]')).toContainText('Chương 1');
        await toc.getByRole('link',{name:/2\. Chương 2/}).click();await expect(toc).toHaveCount(0);
        await page.getByRole('button',{name:'Mục lục',exact:true}).click();await expect(toc.locator('[aria-current="page"]')).toContainText('Chương 2');await page.keyboard.press('Escape');
        await page.getByRole('button',{name:'Tùy chỉnh đọc',exact:true}).click();
        const settings=page.getByRole('dialog',{name:'Tùy chỉnh đọc',exact:true});await expect(settings).toBeVisible();
        await expect.poll(()=>settings.evaluate(el=>el.contains(document.activeElement))).toBe(true);
        await settings.getByRole('textbox',{name:'Font size',exact:true}).fill('22');
        await page.keyboard.press('Escape');await expect(settings).not.toBeVisible();
        await page.getByRole('button',{name:'Tùy chỉnh đọc',exact:true}).click();await expect(settings.getByRole('textbox',{name:'Font size',exact:true})).toHaveValue('22');
        await settings.getByRole('button',{name:'Save preferences',exact:true}).click();await expect.poll(()=>preferences.fontSize).toBe(22);
        const bounds=await settings.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=page.viewportSize().width);
        await expect.poll(()=>settings.evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
        assert.equal(await page.locator('.chapter-prose').evaluate(el=>getComputedStyle(el).color),'rgb(17, 24, 39)','a light reading surface must retain dark text even in the dark app theme');
        await page.screenshot({path:path.join(output,`${mobile?'mobile':'desktop'}-reader.png`)});
        await page.goto(base+'/publicreader');await page.getByRole('button',{name:'Mục lục',exact:true}).click();
        await expect(page.getByRole('dialog',{name:'Mục lục chương'}).getByRole('link',{name:/2\. Chương 2/})).toHaveAttribute('href','/public/chapters/c-2');
        assert.deepEqual(errors,[]);
      }finally{await context.close();}
    }
    console.log(`Navigation screenshots: ${output}`);
  }finally{await browser?.close();await server.close();}
});
