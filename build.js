({
  baseUrl: "app",
  paths: {
    requireLib: "package/requirejs/main",
    "package/session": "package/session/main",
    "package/bart": "package/bart/main",
  },

  include: 'requireLib',

  name: "client/js/main",
  out: "build/index-build.js",
})
