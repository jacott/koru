({
  baseUrl: "app",
  paths: {
    requireLib: "require",
  },

  packages: ['koru', 'koru/model', 'koru/session', 'koru/user-account', 'koru/session'],

  include: 'requireLib',
//  optimize: 'none',

  stubModules: ['koru/dom/template-compiler-server'],

  name: "build-client",
  out: "build/index.js",
})
