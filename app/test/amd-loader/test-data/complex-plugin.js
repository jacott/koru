define({
    load: function (name, req, onload, config) {
      req(name, function (value, pMod) {
        pMod.addDependancy(req.module);
        onload(value);
      }, onload.error);
    },

    pluginBuilder: './complex-plugin-builder',
});
