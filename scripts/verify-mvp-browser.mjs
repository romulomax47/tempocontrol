import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const { chromium } = await import('../.verification-tools/node_modules/playwright/index.mjs');

// Controlled HTTP fixtures exercise the actual Supabase SDK and the mobile UI.
// This is not a claim of live Supabase Auth/email validation. SQL/RLS has its own
// PostgreSQL integration suite; no test fixture is imported by application code.
const origin = 'https://tempcontrol-smoke.example';
const restaurantId = '10000000-0000-4000-8000-000000000001';
const userId = '10000000-0000-4000-8000-000000000002';
const deviceId = '10000000-0000-4000-8000-000000000003';
const user = { id: userId, email: 'ana@example.test', aud: 'authenticated', role: 'authenticated',
  app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-10-07T12:00:00Z' };
const payload = { sub: userId, aud: 'authenticated', role: 'authenticated',
  exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) };
const encode = object => Buffer.from(JSON.stringify(object)).toString('base64url');
const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.synthetic-test-signature`;
const device = { id: deviceId, restaurant_id: restaurantId, name: 'Freezer da cozinha', minimum: -25, maximum: -18, active: true };
const membership = { user_id: userId, restaurant_id: restaurantId, role: 'owner', display_name: 'Ana',
  restaurants: { id: restaurantId, name: 'Restaurante de teste', timezone: 'America/Sao_Paulo' } };
const measurements = [];
const output = new URL('../verification/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route(`${origin}/**`, async route => {
    const request = route.request(); const url = new URL(request.url());
    const respond = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (url.pathname === '/auth/v1/token') return respond({ access_token: accessToken, refresh_token: 'synthetic-refresh-token',
      expires_in: 3600, token_type: 'bearer', user });
    if (url.pathname === '/auth/v1/user') return respond(user);
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (url.pathname === '/rest/v1/restaurant_members') return respond([membership]);
    if (url.pathname === '/rest/v1/equipment') return respond([device]);
    if (url.pathname === '/rest/v1/measurements') {
      if (request.method() === 'POST') {
        const sent = request.postDataJSON();
        assert.deepEqual(Object.keys(sent).sort(), ['equipment_id', 'id', 'temperature']);
        const saved = { ...sent, restaurant_id: restaurantId, recorded_by: userId, equipment_name: device.name,
          responsible_name: 'Ana', minimum: device.minimum, maximum: device.maximum,
          status: sent.temperature >= -25 && sent.temperature <= -18 ? 'normal' : 'alerta', recorded_at: new Date().toISOString() };
        measurements.unshift(saved); return respond(saved, 201);
      }
      return respond(measurements);
    }
    return respond({ message: 'Unexpected request in browser smoke test' }, 500);
  });
  await page.goto('http://127.0.0.1:4175', { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Entrar', exact: true }).waitFor();
  await page.getByLabel('E-mail', { exact: true }).fill(user.email);
  await page.getByLabel('Senha', { exact: true }).fill('synthetic-password-only');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByRole('heading', { name: 'Restaurante de teste' }).waitFor();
  for (const temperature of ['-20.55', '-17']) {
    await page.getByLabel('Equipamento', { exact: true }).selectOption(deviceId);
    await page.getByLabel('Temperatura (°C)', { exact: true }).fill(temperature);
    await page.getByRole('button', { name: 'Registrar temperatura', exact: true }).click();
    await page.locator('article').filter({ hasText: `${temperature} °C` }).waitFor();
  }
  assert.equal(await page.getByRole('article').count(), 2);
  const before = await page.locator('.historico').innerText();
  await page.screenshot({ path: fileURLToPath(new URL('mvp-mobile-before.png', output)), fullPage: true });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Restaurante de teste' }).waitFor();
  const after = await page.locator('.historico').innerText();
  assert.equal(after, before, 'Database fixture history must be reloaded after a real page reload');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(overflow, false, 'No horizontal overflow at 375px');
  const localMeasurementKeys = await page.evaluate(() => Object.keys(localStorage).filter(key => /tempcontrol_medicoes/i.test(key)));
  assert.deepEqual(localMeasurementKeys, [], 'Cloud measurements must never be written to localStorage');
  await page.screenshot({ path: fileURLToPath(new URL('mvp-mobile-after.png', output)), fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  assert.equal(await page.getByRole('heading', { name: 'TempControl', exact: true }).evaluate(node => getComputedStyle(node).color), 'rgb(34, 34, 34)');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  await page.screenshot({ path: fileURLToPath(new URL('mvp-mobile-dark-preference.png', output)), fullPage: true });
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await page.getByRole('heading', { name: 'Entrar', exact: true }).waitFor();
  assert.equal(await page.getByRole('article').count(), 0, 'Restaurant data is removed on sign out');
  assert.deepEqual(pageErrors, []);
  const report = { browser: browser.version(), viewport: '375x812', httpFixtures: true, liveSupabase: false,
    measurements: measurements.length, reloadPreservedHistory: before === after,
    horizontalOverflow: overflow, darkPreferenceReadable: true, localMeasurementKeys, logoutClearedData: true, pageErrors };
  await writeFile(new URL('mvp-browser.json', output), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
