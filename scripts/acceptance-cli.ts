import path from 'node:path';
import { runAcceptance } from '../src/main/services/acceptance';
const out = path.resolve(process.argv[2] ?? 'reports');
runAcceptance(out).then(({ summary, reports }) => {
  for (const r of reports) for (const c of r.checks) console.log(`[${c.status.toUpperCase().padEnd(4)}] ${r.report.padEnd(12)} ${c.title}\n        ${c.detail.split('\n')[0].slice(0, 300)}`);
  console.log(JSON.stringify(summary.reports), summary.status);
  process.exit(summary.status === 'pass' ? 0 : 1);
});
