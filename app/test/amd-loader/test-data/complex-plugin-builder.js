define({
  load: function (name, req, onload) {
    onload.fromText(text(req.module.id, name));
    onload();
    return;
  },
});

function text(pluginName, name) {
  return 'define('+JSON.stringify([name])+ ', function(client) {return client});\n';
}
