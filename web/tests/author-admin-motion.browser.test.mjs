import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';

test('author/admin motion preserves filters, actions, values and reader role exclusion', { timeout: 180000 }, async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'storycraft-author-motion-'));
  const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { host: '127.0.0.1', port: 0 },
    plugins: [{ name: 'author-admin-motion-test', configureServer(vite) {
      vite.middlewares.use('/__author_motion', async (req, res, next) => {
        try {
          res.setHeader('Content-Type', 'text/html');
          res.end(await vite.transformIndexHtml('/__author_motion', `<!doctype html><html lang="vi"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script src="/theme-init.js"></script>
            <style>.material-symbols-outlined{font-family:'Material Symbols Outlined Variable';font-size:18px;line-height:1}body[data-fixture-mode="admin-novels"] .sc-workspace-table{max-width:600px}body[data-fixture-mode="admin-novels"] .sc-sticky-table{max-height:100px}body[data-fixture-mode="admin-novels"] .sc-sticky-table table{min-width:1000px}body[data-fixture-mode="admin-novels"] .sc-sticky-table td{height:80px}</style></head><body><div id="root"></div><script type="module">
            import React from 'react'; import { createRoot } from 'react-dom/client';
            import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'; import { useQueryClient } from '@tanstack/react-query';
            import { AppProviders } from '/src/app/providers.tsx';
            import { AuthorTheme } from '/src/shared/components/AuthorTheme.tsx';
            import { AuthorProjectsPage } from '/src/features/author-projects/AuthorProjectsPage.tsx';
            import { AuthorNovelMetadataPage } from '/src/features/author-projects/AuthorNovelMetadataPage.tsx';
            import { AdminOverviewPage } from '/src/features/admin/AdminOverviewPage.tsx';
            import { AdminNovelsPage } from '/src/features/admin/AdminNovelsPage.tsx';
            import { AdminWithdrawsPage } from '/src/features/admin/AdminWithdrawsPage.tsx';
            import { WalletPage } from '/src/features/wallet/WalletPage.tsx';
            import { useAuthStore } from '/src/features/auth/useAuthStore.ts';
            import '@fontsource/be-vietnam-pro/400.css'; import '@fontsource/be-vietnam-pro/500.css'; import '@fontsource/be-vietnam-pro/600.css';
            import '@fontsource-variable/material-symbols-outlined/full.css'; import '/src/styles.css'; import '/src/theme/color-mode.css';
            const h=React.createElement;const mode=location.pathname.split('/').at(-1);
            document.body.dataset.fixtureMode=mode;
            const role=mode==='wallet-reader'?'READER':mode.startsWith('admin')?'ADMIN':'AUTHOR';
            useAuthStore.getState().setSession({accessToken:'fixture',user:{userId:mode==='author-other'?'other-user':'fixture-user',username:'tester',displayName:'Người thử',email:'test@example.invalid',role,status:'ACTIVE'}});
            function Demo(){const client=useQueryClient();const location=useLocation();window.refreshProjects=()=>client.invalidateQueries({queryKey:['author-projects']});if(location.pathname.startsWith('/author/novels/'))return h(Routes,null,h(Route,{path:'/author/novels/:novelId',element:h(AuthorTheme,null,h(AuthorNovelMetadataPage))}));if(mode.startsWith('admin'))return h(mode==='admin'?AdminOverviewPage:mode==='admin-novels'?AdminNovelsPage:AdminWithdrawsPage);if(mode.startsWith('wallet-'))return h(WalletPage);return h(AuthorTheme,null,h(AuthorProjectsPage));}
            createRoot(document.getElementById('root')).render(h(AppProviders,null,h(BrowserRouter,null,h(Demo))));
            </script></body></html>`));
        } catch(error){next(error);}
      });
    }}] });
  let browser;
  try {
    await server.listen();browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||undefined});
    const base=`http://127.0.0.1:${server.httpServer.address().port}/__author_motion`;
    for(const mobile of [false,true]) {
      const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},reducedMotion:mobile?'reduce':'no-preference'});
      const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.addInitScript(theme=>localStorage.setItem('storycraft-theme',theme),mobile?'dark':'light');
      let views=1200,releaseCover,croppedData='',mediaCalls=0;
      const cover=new Promise(resolve=>{releaseCover=resolve;});
      await page.route('**/test-cover.svg',async route=>{await cover;return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="150"><rect width="100" height="150" fill="#dd8567"/></svg>'});});
      await page.route('**/broken-cover.png',route=>route.fulfill({status:404,body:'Not found'}));
      await page.route('**/test-uploaded-cover.jpg',route=>route.fulfill({contentType:'image/jpeg',body:Buffer.from(croppedData,'base64')}));
      await page.route('**/api/v1/**',async route=>{
        const pathname=new URL(route.request().url()).pathname;let data=[];
        if(pathname.endsWith('/novels/me'))data=[1,2,3].map(n=>({novelId:'novel-'+n,title:'Tác phẩm '+n,synopsis:'Giới thiệu tác phẩm thử nghiệm.',genre:'Fantasy',genres:['Fantasy'],status:n===1?'DRAFT':'PUBLISHED',serialStatus:'ONGOING',coverImageUrl:n===1?'/test-cover.svg':n===2?'/broken-cover.png':null,viewsCount:n===1?views:0,chaptersCount:n,updatedAt:'2026-10-27T08:00:00Z'}));
        else if(pathname.endsWith('/novels/genres'))data=['Fantasy'];
        else if(/\/novels\/novel-\d$/.test(pathname))data={novelId:pathname.split('/').at(-1),title:'Tác phẩm 1',authorId:'fixture-user',status:'DRAFT',serialStatus:'ONGOING',synopsis:'Giới thiệu tác phẩm',genre:'Fantasy',genres:['Fantasy'],tags:[],coverImageUrl:'/test-cover.svg',viewsCount:1200,createdAt:'2026-10-27T08:00:00Z',updatedAt:'2026-10-27T08:00:00Z'};
        else if(pathname.endsWith('/statistics'))data={ratingAverage:null,followersCount:0,totalWords:0};
        else if(/\/novels\/novel-\d\/earnings$/.test(pathname))data={unlockCoins:0};
        else if(pathname.endsWith('/admin/novels'))data=[1,2].map(n=>({novelId:'admin-book-'+n,title:'Truyện admin '+n,authorUsername:'author'+n,synopsis:'Giới thiệu '+n,status:'DRAFT',serialStatus:'ONGOING',chaptersCount:n,deletedAt:null}));
        else if(pathname.endsWith('/admin/withdraw-requests'))data=[];
        else if(pathname.endsWith('/admin/dashboard/stats'))data={totalUsers:20,totalNovels:3,newUsers7Days:4,newNovels7Days:2,pendingModerationItems:2,pendingReports:1,totalDepositedCoins:1234,pendingWithdraws:1,generatedAt:'2026-10-27T08:00:00Z',activity:[1,2,3,4,5,6,7].map(n=>({date:'2026-10-'+(20+n),users:n,novels:n%3}))};
        else if(pathname.endsWith('/wallet/me'))data={walletId:'wallet-test',coinsBalance:1234,lockedCoins:100};
        else if(pathname.endsWith('/wallet/earnings'))data={asOfDay:'2026-10-27',timeZone:'Asia/Bangkok',totalEarnedCoins:80,daily:[{day:'2026-10-27',amountCoins:80,unlockCoins:60,donateCoins:20}]};
        else if(pathname.endsWith('/wallet/deposit-packages'))data=[{code:'COIN_100',amountCoins:100}];
        else if(pathname.endsWith('/media')){mediaCalls++;croppedData=route.request().postDataJSON().data;data={path:'/test-uploaded-cover.jpg'};}
        return route.fulfill({json:{success:true,data,meta:{totalItems:Array.isArray(data)?data.length:0,totalPages:1}}});
      });
      try {
        await page.goto(base+'/author',{waitUntil:'domcontentloaded'});
        const loading=page.locator('.sc-loaded-image[data-state="loading"]').first();await expect(loading).toBeVisible();
        const coverBox=await loading.boundingBox();releaseCover();
        const loaded=page.locator('.sc-loaded-image[data-state="loaded"]').first();await expect(loaded).toBeVisible();
        assert.deepEqual(await loaded.boundingBox(),coverBox,'loading images must retain cover geometry');
        await expect(page.locator('.sc-loaded-image[data-state="error"]')).toHaveCount(1);
        await expect(page.getByRole('article')).toHaveCount(3);
        await page.getByTitle('Danh sách',{exact:true}).click();await expect(page.locator('.sc-motion-project')).toHaveCount(3);
        await expect.poll(()=>page.locator('.sc-motion-project').first().evaluate(el=>el.tagName)).toBe('DIV');
        await expect(page.getByRole('link',{name:'Quản lý',exact:true})).toHaveCount(3);
        await page.reload();await expect(page.locator('.sc-motion-project')).toHaveCount(3);
        assert.equal(await page.locator('.sc-motion-project').first().evaluate(el=>el.tagName),'DIV','view mode persists after reload');
        await page.getByTitle('Lưới',{exact:true}).click();await expect(page.getByRole('article')).toHaveCount(3);
        await expect(page.locator('.sc-motion-project')).toHaveCount(3);
        const results=page.locator('.sc-results-surface');
        const surface=results.locator('..').locator('..');const height=(await surface.boundingBox()).height;
        const search=page.getByPlaceholder('Tìm kiếm tác phẩm theo tên...');
        await search.fill('Không có kết quả');
        await expect(page.getByRole('button',{name:'Bỏ bộ lọc Tìm: Không có kết quả',exact:true})).toBeVisible();
        assert.ok((await surface.boundingBox()).height>=height-1,'search must reserve list height');
        await expect(page.getByRole('button',{name:/Tạo tác phẩm đầu tiên/})).toBeVisible();
        await page.getByRole('button',{name:'Bỏ bộ lọc Tìm: Không có kết quả',exact:true}).click();await expect(search).toHaveValue('');
        await expect(page.getByRole('article')).toHaveCount(3);
        await search.fill('Tác phẩm');
        await page.getByRole('button',{name:/^Bản nháp/}).click();await expect(page.getByRole('article')).toHaveCount(1);
        await page.getByRole('button',{name:'Bỏ bộ lọc Bản nháp',exact:true}).click();await expect(page.getByRole('article')).toHaveCount(3);
        await expect(search).toHaveValue('Tác phẩm');
        await page.getByRole('button',{name:'Bỏ bộ lọc Tìm: Tác phẩm',exact:true}).click();
        await page.getByRole('button',{name:'Ghim Tác phẩm 3',exact:true}).click();
        await expect(page.locator('.sc-motion-project').first()).toContainText('Tác phẩm 3');
        await page.getByRole('checkbox',{name:'Chỉ tác phẩm đã ghim'}).check();
        await expect(page.getByRole('article')).toHaveCount(1);
        await page.reload();await expect(page.getByRole('checkbox',{name:'Chỉ tác phẩm đã ghim'})).toBeChecked();
        await expect(page.getByRole('article')).toHaveCount(1);
        await page.getByRole('checkbox',{name:'Chỉ tác phẩm đã ghim'}).uncheck();
        await page.getByRole('button',{name:'Bỏ ghim Tác phẩm 3',exact:true}).click();
        await search.fill('Tác phẩm 1');await page.getByRole('button',{name:/^Bản nháp/}).click();
        await page.locator('.sc-filter-presets summary').filter({hasText:'Bộ lọc đã lưu'}).click();
        await page.getByRole('textbox',{name:'Tên bộ lọc',exact:true}).fill('Bản nháp của tôi');
        await page.getByRole('button',{name:'Lưu bộ lọc',exact:true}).click();
        await page.reload();await expect(search).toHaveValue('Tác phẩm 1');await expect(page.getByRole('article')).toHaveCount(1);
        assert.equal(new URL(page.url()).searchParams.get('status'),'DRAFT');
        await page.getByRole('button',{name:'Bỏ bộ lọc Tìm: Tác phẩm 1',exact:true}).click();
        await page.getByRole('button',{name:'Bỏ bộ lọc Bản nháp',exact:true}).click();
        await page.locator('.sc-filter-presets summary').filter({hasText:'Bộ lọc đã lưu'}).click();
        await page.getByRole('button',{name:'Bản nháp của tôi',exact:true}).click();
        await expect(search).toHaveValue('Tác phẩm 1');await expect(page.getByRole('article')).toHaveCount(1);
        await page.getByRole('button',{name:'Bỏ bộ lọc Tìm: Tác phẩm 1',exact:true}).click();
        await page.getByRole('button',{name:'Bỏ bộ lọc Bản nháp',exact:true}).click();
        await search.focus();await page.keyboard.type('n/');await expect(search).toHaveValue('n/');
        await search.fill('');await search.blur();await page.keyboard.press('/');await expect(search).toBeFocused();
        await search.blur();await page.keyboard.press('Control+k');await expect(page.getByRole('combobox',{name:'Tìm lệnh'})).toBeVisible();
        await page.getByRole('combobox',{name:'Tìm lệnh'}).fill('VI VA DOANH THU');
        await expect(page.getByRole('option',{name:'Ví và doanh thu'})).toBeVisible();
        await page.getByRole('combobox',{name:'Tìm lệnh'}).fill('tac pham 2');
        await expect(page.getByRole('option',{name:'Quản lý · Tác phẩm 2',exact:true})).toBeVisible();
        await expect(page.getByRole('option',{name:'Viết tiếp · Tác phẩm 2',exact:true})).toBeVisible();
        await expect(page.getByRole('option',{name:'Cẩm nang · Tác phẩm 2',exact:true})).toBeVisible();
        await page.keyboard.press('Escape');
        await page.getByRole('button',{name:'Phím tắt',exact:true}).click();await expect(page.getByRole('dialog',{name:'Phím tắt'})).toBeVisible();await page.keyboard.press('Escape');
        const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=300;canvas.height=150;const c=canvas.getContext('2d');c.fillStyle='#ff0000';c.fillRect(0,0,100,150);c.fillStyle='#00ff00';c.fillRect(100,0,100,150);c.fillStyle='#0000ff';c.fillRect(200,0,100,150);return canvas.toDataURL('image/png').split(',')[1];});
        await page.getByRole('button',{name:/Tạo tác phẩm mới/}).click();
        await page.locator('input[type="file"]').setInputFiles({name:'cover.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
        const cropEditor=page.getByRole('region',{name:'Cắt ảnh bìa',exact:true});await expect(cropEditor).toBeVisible();
        await expect(page.getByRole('button',{name:'Dùng ảnh đã cắt',exact:true})).toBeEnabled();
        assert.equal(mediaCalls,0,'selecting a file must not upload before crop confirmation');
        await page.getByRole('slider',{name:'Vị trí ngang ảnh bìa'}).focus();await page.keyboard.press('End');
        await cropEditor.screenshot({path:path.join(output,`${mobile?'mobile':'desktop'}-crop.png`)});
        await page.getByRole('button',{name:'Dùng ảnh đã cắt',exact:true}).click();await expect(cropEditor).toHaveCount(0);
        assert.equal(mediaCalls,1);
        const decoded=await page.evaluate(async data=>{const img=await createImageBitmap(await(await fetch('data:image/jpeg;base64,'+data)).blob());const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const c=canvas.getContext('2d');c.drawImage(img,0,0);const pixel=[...c.getImageData(300,450,1,1).data];return{width:img.width,height:img.height,pixel};},croppedData);
        assert.equal(decoded.width,600);assert.equal(decoded.height,900);assert.ok(decoded.pixel[2]>240 && decoded.pixel[0]<10,'exported JPEG must contain the selected blue crop, not the original image');
        await page.locator('input[type="file"]').setInputFiles({name:'cover.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await expect(cropEditor).toBeVisible();
        await page.getByRole('button',{name:'Hủy cắt ảnh',exact:true}).click();assert.equal(mediaCalls,1,'canceling crop must not upload');
        await page.keyboard.press('Escape');
        views=1800;await page.evaluate(()=>window.refreshProjects());
        await expect.poll(()=>page.locator('.sc-animated-number .sc-motion-sr-only').allTextContents()).toContain('1.8K');
        await expect.poll(()=>page.locator('.sc-animated-number > span[aria-hidden="true"]:not(.sc-number-reserve)').allTextContents()).toContain('1.8K');
        await page.evaluate(async()=>{await document.fonts.ready;scrollTo(0,0);});await page.screenshot({path:path.join(output,`${mobile?'mobile':'desktop'}-author.png`),fullPage:true});
        await page.getByRole('link',{name:/Quản lý/}).first().evaluate(el=>el.focus({preventScroll:true}));
        await page.evaluate(()=>{document.body.style.minHeight='2200px';scrollTo(0,350);});
        await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(350);
        await page.keyboard.press('Enter');
        await expect(page.getByRole('button',{name:'Đổi ảnh bìa',exact:true})).toBeVisible();
        await expect(page.locator('.sc-novel-cover .sc-loaded-image[data-state="loaded"]')).toBeVisible();
        assert.equal(await page.locator('.sc-novel-cover .sc-loaded-image').evaluate(el=>getComputedStyle(el).padding),'0px');
        await page.evaluate(()=>scrollTo(0,0));await page.goBack();
        await expect(page.getByRole('article')).toHaveCount(3);
        await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(350);
        await page.getByText('Vừa làm việc',{exact:true}).click();
        await expect(page.locator('details').filter({has:page.getByText('Vừa làm việc',{exact:true})}).getByRole('link',{name:'Tác phẩm 1',exact:true})).toBeVisible();

        await page.goto(base+'/admin');await expect(page.locator('.admin-metric')).toHaveCount(4);
        await expect(page.locator('svg .sc-author-chart-bar')).toHaveCount(14);
        await expect(page.locator('.admin-metric').first()).toContainText('20');
        if(mobile)assert.equal(await page.locator('svg .sc-author-chart-bar').first().evaluate(el=>getComputedStyle(el).animationName),'none');
        await expect.poll(()=>page.locator('svg .sc-author-chart-bar').first().evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).d)).toBe(1);
        await page.screenshot({path:path.join(output,`${mobile?'mobile':'desktop'}-admin.png`)});

        await page.goto(base+'/admin-novels');await expect(page.locator('.sc-workspace-table tbody tr')).toHaveCount(2);
        await page.getByText('Cột hiển thị',{exact:true}).click();
        await page.getByRole('checkbox',{name:'Tác giả',exact:true}).uncheck();
        await expect(page.getByRole('columnheader',{name:'Tác giả',exact:true})).toHaveCount(0);
        await expect(page.getByRole('columnheader',{name:'Thao tác',exact:true})).toBeVisible();
        const tableScroll=page.getByRole('region',{name:'Bảng dữ liệu có thể cuộn',exact:true});
        await tableScroll.evaluate(el=>{el.scrollLeft=120;el.scrollTop=30;});
        await expect.poll(()=>tableScroll.evaluate(el=>[el.scrollLeft,el.scrollTop])).toEqual([120,30]);
        await page.reload();await expect(page.getByRole('columnheader',{name:'Tác giả',exact:true})).toHaveCount(0);
        await expect.poll(()=>tableScroll.evaluate(el=>[el.scrollLeft,el.scrollTop])).toEqual([120,30]);
        await page.getByRole('button',{name:'Xem nhanh',exact:true}).first().click();
        await expect(page.getByRole('dialog',{name:'Truyện admin 1',exact:true})).toBeVisible();
        await page.getByRole('button',{name:'Sau',exact:true}).click();
        await expect(page.getByRole('dialog',{name:'Truyện admin 2',exact:true})).toBeVisible();
        await expect(page.getByRole('button',{name:'Sau',exact:true})).toBeDisabled();
        await page.screenshot({path:path.join(output,`${mobile?'mobile':'desktop'}-preview.png`)});
        await page.keyboard.press('Escape');
        await page.getByText('Cột hiển thị',{exact:true}).click();await page.getByRole('button',{name:'Khôi phục',exact:true}).click();
        await expect(page.getByRole('columnheader',{name:'Tác giả',exact:true})).toBeVisible();
        await page.goto(base+'/admin-withdraws?status=&page=2');
        if(mobile)await page.getByRole('button',{name:'Bộ lọc',exact:true}).click();
        await expect(page.getByRole('textbox',{name:'Trạng thái',exact:true})).toHaveValue('Tất cả trạng thái');
        assert.equal(new URL(page.url()).searchParams.get('status'),'','explicit empty filter must override PENDING default');

        await page.goto(base+'/author-other');
        await expect(page.getByRole('article')).toHaveCount(3);
        await expect(page.getByRole('button',{name:'Bản nháp của tôi',exact:true})).toHaveCount(0);
        await expect(page.locator('.sc-preset')).toHaveCount(0);
        await expect(page.locator('.sc-project-pin[aria-pressed="true"]')).toHaveCount(0);

        await page.goto(base+'/wallet-author');await expect(page.locator('.sc-animated-number')).toHaveCount(3);
        await expect.poll(()=>page.locator('.sc-author-chart-bar').count()).toBeGreaterThan(0);
        await page.goto(base+'/wallet-reader');await expect(page.locator('body')).toContainText('1.234');
        await expect(page.getByRole('button',{name:'Lệnh nhanh',exact:true})).toHaveCount(0);
        await expect(page.locator('.sc-animated-number')).toHaveCount(0);await expect(page.locator('.sc-author-chart-bar')).toHaveCount(0);
        assert.deepEqual(errors,[]);
      }catch(error){console.error('Workspace failure URL:',page.url(),'screenshots:',output);await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});throw error;}finally{releaseCover();await context.close();}
    }
    console.log(`Author/admin screenshots: ${output}`);
  }finally{await browser?.close();await server.close();}
});
