define((require, exports, module) => {
  'use strict';
  const TH              = require('koru/test');

  const {stub, spy, util, match: m} = TH;

  const Module = module.constructor;

  const {ctx} = module;
  const baseUrl = ctx.baseUrl + 'test/amd-loader/';

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    let myCtx;
    let oldCtx = Module.currentCtx;
    beforeEach(() => {
      myCtx = new ctx.constructor({context: 'my ctx', baseUrl});
      Module.currentCtx = myCtx;
    });

    afterEach(() => {
      ctx.constructor.remove('my ctx');
      Module.currentCtx = oldCtx;
    });

    test('should handle dependencies', () => {
      Module.pause(myCtx);
      const order = [];
      Module.define('m1', ['module', 'm2'], (module) => {
        order.push(module.id);
      });

      Module.define('m2', ['module'], (module) => {
        order.push(module.id);
      });

      Module.define('m3', ['module'], (module) => {
        order.push(module.id);
      });

      assert.equals(order, []);

      Module.unpause(myCtx);

      assert.equals(order, ['m2', 'm1', 'm3']);
    });

    test('should break cycles', () => {
      Module.pause(myCtx);
      const order = [];
      Module.define('m1', ['module', 'm2'], (module) => {
        order.push(module.id);
      });

      Module.define('m2', ['module', 'm3'], (module) => {
        order.push(module.id);
      });

      Module.define('m3', ['module', 'm1'], (module) => {
        order.push(module.id);
      });

      assert.equals(order, []);

      Module.unpause(myCtx);

      assert.equals(order, ['m3', 'm2', 'm1']);
    });

    test('should work with plugins', () => {
      Module.pause(myCtx);
      const order = [];

      Module.define('b1', 'b1exp');

      Module.define('p1', {
        load(name, req, onload, config) {
          order.push('p1', name);
          onload('realFoo');
        },
      });

      Module.define('p2', {
        load(name, req, onload, config) {
          order.push('p2', name);
          onload('p2Foo');
        },
      });

      Module.define('m1', [
        'require', 'exports', 'module', 'p1!foo',
        'p2' // cause p2 to resolve early
      ], (
        require, exports, module, p1foo,
      ) => {
        order.push(module.id, p1foo);
      });

      Module.define('m3', ['module', 'm1', 'p2!foo2'], (module, m1, p2) => {
        order.push(module.id);
      });

      assert.equals(order, []);

      Module.unpause(myCtx);

      Module.breakCycle(myCtx);

      assert.equals(order, ['p1', 'foo', 'p2', 'foo2', 'm1', 'realFoo', 'm3']);
    });
  });
});
