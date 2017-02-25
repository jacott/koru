define(function (require, exports, module) {
  /**
   * Publish a set of records from the server to the client
   **/
  const api = require('koru/test/api');
  const TH  = require('./test-helper');

  const sut  = require('./publish');
  var v;

  TH.testCase(module, {
    setUp() {
      v = {};
      api.module();
    },

    tearDown() {
      v = null;
    },

    "test publish"() {
      /**
       * Register a publish function. The publish function has
       * different roles on the client and server
       *
       * On client - register {#koru/session/client-sub#match}
       * functions.
       *
       * On server - send related records and observe models for
       * updates.
       *
       * @param [module] register this module (and auto de-register if
       * unloaded)

       * @param {string} [name] The name to register; uses `module.id`
       * by default

       * @param {function} func The function to invoke when subscrib
       * is called
       **/
      const publish = api.custom(sut);

      const module = new TH.MockModule("test-publish");

      this.onEnd(() => {sut._destroy("TestPublish")});

      api.example(() => {
        publish(module, function publish(arg1, arg2) {
          v.sub = this;
        }, "TestPublish");
      });

      sut._pubs.TestPublish.call(v.exp = {});
      assert.same(v.sub, v.exp);
    },


  });
});
