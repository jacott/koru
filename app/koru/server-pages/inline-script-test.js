isServer && define((require, exports, module)=>{
  'use strict';
  /**
   * Build a script function that contains from various modules that is suitable for insertion into
   * an html page. It works similar to the AMD module loading but builds just one monolithic script
   * without any other dependencies.
   **/
  const koru            = require('koru');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const vm = requirejs.nodeRequire('vm');

  const {stub, spy, util, match: m} = TH;

  const InlineScript = require('./inline-script');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    test("new", ()=>{
      /**
       * Create a new InlineScript processor.

       * @param dir The local directory used by {#require} to normalize the id.
       **/
      const InlineScript = api.class();
      //[
      const script = new InlineScript(module.dir);

      script.require('./test-inline/simple');

      assert.equals(script.map, {'koru/server-pages/test-inline/simple.js': 0});
      assert.equals(script.modules, ["'simple'"]);
      //]
    });

    test("require", ()=>{
      /**
       * Load another module (if not already loaded) and return its body function. require is also
       * available with a define body.
       **/
      api.protoMethod();
      //[
      const script = new InlineScript(module.dir);

      script.require('./test-inline/nested');

      assert.equals(script.map, {
        'koru/server-pages/test-inline/simple.js': 0,
        'koru/server-pages/test-inline/level2.js': 1,
        'koru/server-pages/test-inline/nested.js': 2,
      });

      assert.match(script.modules[2], /Simple = modules\[0\];/);
      assert.match(script.modules[2], /Level2 = modules\[1\];/);
      assert.equals(script.modules[0], "'simple'");
      //]
    });

    test("generate", ()=>{
      /**
       * Generate a source script ready for instertion into a web page.
       **/
      api.protoMethod();
      try {
        //[
        const script = new InlineScript(module.dir);

        script.require('./test-inline/nested');

        const ans = vm.runInThisContext(script.generate(), {
          filename: 'inline', displayErrors: true, timeout: 5000});

        assert.equals(ans(), 'nested, level2, simple, simple');

        //]
      } catch(err) {
        if (err.name !== 'SyntaxError') throw err;
        koru.info(err.stack);
        throw "SyntaxError";
      }
    });

    test("add", ()=>{
      /**
       * Add a named object to the modules list

       * @param id the id to reference the object with a `require`

       * @param object the object to add (will be converted to string using `#toString`)
       **/
      api.protoMethod();
      //[
      const script = new InlineScript(module.dir);

      script.add('obj-1', JSON.stringify([1, 2, 3]));
      script.add('obj-2', "new Date()");

      assert.same(script.require('obj-2'), 1);

      assert.equals(script.modules[script.map['obj-1']], '[1,2,3]');
      assert.equals(script.modules[script.map['obj-2']], 'new Date()');
      //]

      assert.same(script.require('obj-2'), 1);
      assert.same(script.topId, 'obj-2');
    });
  });
});
