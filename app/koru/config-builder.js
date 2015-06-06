define({
  load: function (name, req, onload, config) {
    buildConfig = config;

    onload.fromText(name, text(name));
    onload();
    return;
  },

  normalize: function (name, normalize) {
    if (name[0] === ':') return name;
    return ':'+normalize(name);
  },

  write: function (pluginName, name, write) {
    write.asModule(pluginName + "!" + name, text(name));
  },
});

var buildConfig;

function text(name) {
  var delegate = buildConfig.config['koru/config'][name.substring(1)];

  return 'define(["'+delegate+'"], function(sub) {return sub});\n';
}
