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

       * @param {string} [name] The name to register; derives from
       * `module.id` by default

       * @param {function} init The function to invoke when subscribe
       * is called. It is called with `this` set to the subscription
       * instance: {#koru/session/publish-server::sub} for server and
       * {#koru/session/client-sub} for client

       * @param {function} [preload] A preload function to call on
       * client; see {#koru/session/publish-client.preload}
       **/
      const publish = api.custom(sut);


      this.onEnd(() => {
        sut._destroy("TestPublish");
        sut._destroy("LibraryBooks");
      });

      function subscribe(name, ...args) {
        sut._pubs[name].apply(v.exp = {
          match: {register: TH.test.stub()}
        }, args);
      }

      api.example(() => {
        const module = new TH.MockModule("id/for/publish-library-books-client");

        publish({
          module,
          init(titleRE, arg2) {
            this.match.register("Book", doc => titleRE.test(doc.title));
          },
        });
        subscribe("LibraryBooks", /time/i, 20);

        // Note that the path, "publish-", and "-client" is removed
        // from id to derive "LibraryBooks"

        // Another example of id is:
        // id: id/for/product-catalog-server => ProductCatalog
      });
      assert.calledWith(v.exp.match.register, "Book");

      v.sub = null;
      api.example(() => {
        const module = new TH.MockModule("id/with/funny-name");

        publish({
          module,
          init(arg1, arg2) {
            this.match.register("Foo", doc => true);
          },
          name: "TestPublish",
        });
        subscribe("TestPublish"); // overrides module.id
      });
      assert.calledWith(v.exp.match.register, "Foo");
    },
  });
});
