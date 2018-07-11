const text = name => `define(["${name}-client"], function(client) {return client});\n`;

define({
  load(name, req, onload, config) {
    onload.fromText(text(name));
    onload();
  },
});
