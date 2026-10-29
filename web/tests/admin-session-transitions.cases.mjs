import assert from 'node:assert/strict';

export async function adminSessionTransitions({ t, browser, output, origin }) {
  await t.test(
    'R74-03: guest, reader, author and admin session transitions preserve role navigation and appeals',
    async () => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const snapshot = async (role) => {
        for (const theme of ['light', 'dark'])
          for (const width of [1440, 390]) {
            await page.setViewportSize({ width, height: 1000 });
            await page.evaluate((theme) => {
              window.storycraftTheme.write(theme);
              window.storycraftTheme.apply();
            }, theme);
            await page.waitForFunction(
              (theme) => document.documentElement.dataset.theme === theme,
              theme
            );
            assert.ok(
              await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
              `${role}/${theme}/${width}: overflow`
            );
            await page.screenshot({
              path: `${output}/session-${role.toLowerCase()}-${theme}-${width}.png`,
              fullPage: true
            });
          }
        await page.setViewportSize({ width: 1440, height: 1000 });
      };
      const login = async (username, role) => {
        await page.goto(origin + '/login');
        await page.getByLabel('Email or username', { exact: true }).fill(username);
        await page.getByLabel('Password', { exact: true }).fill('AdminDemo@2026');
        await page.getByRole('button', { name: 'Login', exact: true }).click();
        await page.waitForFunction(
          ({ username, role }) => {
            const marker = document.querySelector('[data-testid="shell-session"]');
            return (
              marker?.getAttribute('data-username') === username &&
              marker?.getAttribute('data-user-role') === role
            );
          },
          { username, role }
        );
        await page.locator('main h1,main h2').first().waitFor();
      };
      const logout = async (role) => {
        if (role === 'ADMIN') await page.locator('.admin-account-button').click();
        else await page.getByTestId('shell-avatar-btn').click();
        await page.getByTestId('shell-logout-btn').click();
        await page.waitForURL('**/login');
        assert.equal(await page.getByTestId('shell-session').count(), 0);
      };
      try {
        await page.goto(origin + '/public');
        await page.locator('h1,h2').first().waitFor();
        assert.equal(await page.getByTestId('shell-session').count(), 0);
        assert.equal(await page.locator('.sc-global-nav a[href="/author/projects"]').count(), 0);
        if (process.env.PR74_COMBINED_READER === '1') {
          await page.locator('.sc-global-nav a[href="/public"]').waitFor();
          await page.locator('.sc-navbar a[href="/login"]').waitFor();
        }
        await snapshot('GUEST');
        await login('admin_seed_14', 'READER');
        await page.locator('.sc-global-nav a[href="/reader/library"]').waitFor();
        assert.equal(await page.locator('.sc-global-nav a[href="/author/projects"]').count(), 0);
        assert.equal(await page.locator('.sc-continue').count(), 0);
        await snapshot('READER');
        await page.getByTestId('shell-avatar-btn').click();
        await page.getByRole('menuitem', { name: 'Quyết định & khiếu nại', exact: true }).click();
        await page.waitForURL('**/appeals');
        await page.getByRole('heading', { name: 'Quyết định & khiếu nại', exact: true }).waitFor();
        await page.goto(origin + '/reader');
        await logout('READER');
        await login('admin_seed_1', 'AUTHOR');
        await page.locator('.sc-global-nav a[href="/author/projects"]').waitFor();
        await page.locator('.sc-global-nav a[href="/reader"]').waitFor();
        await snapshot('AUTHOR');
        await logout('AUTHOR');
        await login('admin_seed', 'ADMIN');
        await page.locator('.admin-sidebar a[href="/admin/appeals"]').waitFor();
        await snapshot('ADMIN');
        await logout('ADMIN');
        await page.goto(origin + '/public');
        assert.equal(await page.getByTestId('shell-session').count(), 0);
        assert.deepEqual(errors, []);
      } finally {
        await context.close();
      }
    }
  );
}
