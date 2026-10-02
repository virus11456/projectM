const { run } = require('../lib/studio-preflight.cjs');
(async () => {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--database') options.database = true;
    else if (args[i] === '--status-url' && args[i + 1]) options.statusURL = args[++i];
    else throw new Error('invalid arguments');
  }
  const result = await run(process.env, options);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
})().catch(() => {
  console.error('Preflight failed. Usage: studio:preflight [--database] [--status-url HTTPS_STATUS_ENDPOINT]');
  process.exitCode = 1;
});
