requirejs.config({
  packages: [
    "bart-test",
  ],
});


define(['module', 'bart/client'], function (module, core) {
  core.onunload(module, 'reload');
});
