const text = name => `define(["${name}-client"], client => client);\n`;

define({
  load(name, req, onload, config) {
    onload.fromText(text(name));
    onload();
  },
});
