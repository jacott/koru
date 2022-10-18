define({
  /**
   * null plugin
   */
  load(name, req, onload, config) {
    const pMod = req.module.dependOn("./"+name);
    onload();
  },
});
