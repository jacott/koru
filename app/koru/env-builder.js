define({
  load: function (name, req, onload, config) {
    onload.fromText(name, text(name));
    onload();
    return;
  },

  normalize: function (name, normalize) {
    if (name[0] === ':') return name;
    return ':'+normalize(name);
  },

  write: function (pluginName, name, write, config) {
    write.asModule(pluginName + "!" + name, text(name));
  },
});

function text(name) {
  return 'define(["'+name.substring(1)+'-client"], function(client) {return client});\n';
}
