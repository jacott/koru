define(() => {
  const {modules} = globalThis.testCtx;
  const mod = modules['test-data/define-no-deps'] ?? modules['test/amd-loader/test-data/define-no-deps'];
  if (mod.hasOwnProperty('exports')) return 'module should not have exports';
  return 'success';
});
