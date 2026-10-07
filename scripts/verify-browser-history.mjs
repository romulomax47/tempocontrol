import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Run against the local Vite server, in a fresh browser context with synthetic data.
// Playwright is optional tooling, installed with --no-save --package-lock=false.
const output = new URL('../verification/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1200, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'TempControl', exact: true }).waitFor();
  for (const [equipment, temperature] of [['1', '-20.55'], ['2', '5.1']]) {
    await page.getByLabel('Equipamento').selectOption(equipment);
    await page.getByLabel('Temperatura').fill(temperature);
    await page.getByRole('button', { name: 'Registrar temperatura' }).click();
    await page.getByRole('status').filter({ hasText: 'Medição registrada e salva.' }).waitFor();
  }
  const history = page.locator('.historico');
  const before = await history.innerText();
  assert.equal(await page.getByRole('img', { name: 'Normal', exact: true }).count(), 1);
  assert.equal(await page.getByRole('img', { name: 'Alerta', exact: true }).count(), 1);
  assert.match(before, /-20\.55 °C/);
  assert.match(before, /5\.1 °C/);
  await page.screenshot({ path: new URL('before-reload.png', output).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Histórico de medições' }).waitFor();
  const after = await history.innerText();
  assert.equal(after, before, 'Both measurements, limits, statuses and timestamps must survive reload');
  assert.equal(await page.getByRole('img', { name: 'Normal', exact: true }).count(), 1);
  assert.equal(await page.getByRole('img', { name: 'Alerta', exact: true }).count(), 1);
  assert.deepEqual(errors, [], 'No unhandled browser errors');
  await page.screenshot({ path: new URL('after-reload.png', output).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
  const report = { browser: await browser.version(), measurementsBefore: 2, measurementsAfter: 2,
    historyUnchangedAfterReload: before === after, pageErrors: errors, before, after };
  await writeFile(new URL('browser-history.json', output), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
