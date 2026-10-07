import { fork } from 'node:child_process';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
const started = performance.now();
async function modules() {
  for (const name of ['jsdom', 'vitest/node']) {
    const start = performance.now();
    await import(name);
    console.log(name + ' imported in ' + Math.round(performance.now() - start) + 'ms');
  }
}
if (!isMainThread) {
  console.log('thread entered');
  await modules();
  console.log('loading actual Vitest thread entrypoint');
  await import('../node_modules/vitest/dist/workers/threads.js');
  console.log('actual Vitest thread entrypoint loaded');
  parentPort.postMessage('ready');
  parentPort.close();
} else if (process.argv.includes('--child')) {
  console.log('fork entered');
  await modules();
  console.log('loading actual Vitest fork entrypoint');
  await import('../node_modules/vitest/dist/workers/forks.js');
  console.log('actual Vitest fork entrypoint loaded');
  process.send('ready');
  process.disconnect();
} else {
  console.log(JSON.stringify({ node: process.version, execPath: process.execPath, execArgv: process.execArgv, nodeOptions: process.env.NODE_OPTIONS || '' }));
  await modules();
  for (const kind of ['fork', 'thread']) {
    await new Promise(resolve => {
      const worker = kind === 'fork'
        ? fork(new URL(import.meta.url), ['--child'], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
        : new Worker(new URL(import.meta.url), { stdout: true, stderr: true });
      worker.stdout.on('data', chunk => process.stdout.write(kind + ': ' + chunk));
      worker.stderr.on('data', chunk => process.stderr.write(kind + ': ' + chunk));
      const timer = setTimeout(() => {
        console.error(kind + ': startup timeout after 30000ms');
        if (kind === 'fork') worker.kill(); else worker.terminate();
        resolve();
      }, 30000);
      worker.on('message', message => {
        console.log(kind + ': ' + message);
        clearTimeout(timer);
        resolve();
      });
      worker.on('error', error => { console.error(error); clearTimeout(timer); resolve(); });
      worker.on('exit', code => { console.log(kind + ': exit ' + code); clearTimeout(timer); resolve(); });
    });
  }
  console.log('diagnostic finished in ' + Math.round(performance.now() - started) + 'ms');
}
