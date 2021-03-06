define({
  load(name, req, onload, config) {
    const delegate = config.config['koru/config'][name.substring(1)];

    onload.fromText(name, `define(["${delegate}"], sub => sub);\n`);
    onload();
  },
});
