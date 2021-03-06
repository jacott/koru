define((require, exports, module)=>{
  'use strict';
  const koru            = require('koru');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const {stub, spy, util} = TH;

  const sut = require('./module-graph');

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    test("findPath", ()=>{
      /**
       * Finds shortest dependency path from one module to another
       * module that it (indirectly) requires.
       *
       * @param start the module to start from
       * @param goal the module to look for
       * @returns {[Module,...]} from `start` to `goal`
       **/
      api.method('findPath');
      const {modules} = module.ctx;
      assert.equals(sut.findPath(module, modules['koru/util-base']).map(m => m.id),
                    ['koru/module-graph-test', 'koru/main', 'koru/util', 'koru/util-base']);

    });

    test("isRequiredBy", ()=>{
      /**
       * Test if `supplier` is required by `user`.
       *
       * @param supplier the module to look for
       * @param user the module to start from
       * @returns true if path found from user to supplier
       **/

      api.method('isRequiredBy');
      const {modules} = module.ctx;
      assert.isTrue(sut.isRequiredBy(modules['koru/util-base'], module));
      assert.isFalse(sut.isRequiredBy(module, modules['koru/util-base']));
    });

  });
});
