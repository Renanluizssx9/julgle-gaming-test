const root = process.cwd();

function run(command, args, env = process.env) {
  const result = Bun.spawnSync({
    cmd: [command, ...args],
    cwd: root,
    env,
    stdout: 'inherit',
    stderr: 'inherit',
  });

  if (result.exitCode !== 0) {
    process.exit(result.exitCode ?? 1);
  }
}

run('docker', ['compose', 'up', '-d', 'postgres', 'localstack']);
run('bun', ['run', 'migrate']);
run(
  'bun',
  ['test', 'test/integration.test.ts'],
  { ...process.env, RUN_INTEGRATION_TESTS: '1' },
);
