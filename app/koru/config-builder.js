define({
  load: function (name, req, onload, config) {
    var delegate = config.config['koru/config'][name.substring(1)];

    var text = 'define(["'+delegate+'"], function(sub) {return sub});\n';

    onload.fromText(name, text);
    onload();
    return;
  },
});
