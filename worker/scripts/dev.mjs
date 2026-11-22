// Starts `wrangler dev --test-scheduled` and automatically triggers the scheduled cron event
// every 10 seconds so local development works just like production without having to manually
// run curl or press 't' in the terminal.
import { spawn } from 'node:child_process';

const wrangler = spawn('npx', ['wrangler', 'dev', '--test-scheduled'], {
  stdio: 'inherit',
  shell: true,
});

wrangler.on('exit', (code) => {
  process.exit(code ?? 0);
});

let interval = null;
const TICK_INTERVAL_MS = 10_000;

async function checkAndTick() {
  try {
    await fetch('http://127.0.0.1:8787/__scheduled?cron=*+*+*+*+*');
  } catch {
    // server not up yet or shutting down
  }
}

// Start ticking once wrangler is up
setTimeout(() => {
  checkAndTick();
  interval = setInterval(checkAndTick, TICK_INTERVAL_MS);
}, 4000);

process.on('SIGINT', () => {
  if (interval) clearInterval(interval);
  wrangler.kill('SIGINT');
});

process.on('SIGTERM', () => {
  if (interval) clearInterval(interval);
  wrangler.kill('SIGTERM');
});

