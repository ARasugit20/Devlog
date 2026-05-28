/**
 * vsce runs @secretlint with concurrency = os.cpus().length.
 * Some CI/sandbox environments report 0 CPUs, which crashes packaging.
 */
const os = require('os');

const originalCpus = os.cpus.bind(os);

os.cpus = function cpusWithFallback() {
  const detected = originalCpus();
  if (detected.length > 0) {
    return detected;
  }

  const parallel =
    typeof os.availableParallelism === 'function' ? os.availableParallelism() : 1;
  const count = Math.max(1, parallel);

  return Array.from({ length: count }, () => ({
    model: 'fallback',
    speed: 0,
    times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
  }));
};
