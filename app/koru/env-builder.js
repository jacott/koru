define({
  load: function (name, req, onload, config) {
    onload.fromText(text(name));
    onload();
    return;
  },
});

function text(name) {
  return 'define(["'+name+'-client"], function(client) {return client});\n';
}
