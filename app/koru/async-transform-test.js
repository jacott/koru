isServer && define((require, exports, module) => {
  'use strict';
  const Future          = require('koru/future');
  const TH              = require('koru/test');
  const {Readable, Writable} = requirejs.nodeRequire('node:stream');

  const {stub, spy, util, match: m} = TH;

  const asyncTransform = require('./async-transform');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    test('choose', () => {
      assert.same(asyncTransform({method: 'HEAD'}, 'abc.js'), undefined);
      assert.same(asyncTransform({method: 'GET'}, 'abc-client.js'), undefined);
      assert.same(asyncTransform({method: 'GET'}, 'abc-server.js'), undefined);
      assert.same(asyncTransform({method: 'GET'}, 'abc.txt'), undefined);
      assert.isFunction(asyncTransform({method: 'GET'}, 'abc.js'));
    });

    group('transform', () => {
      class Reader extends Readable {
        constructor(...inputs) {
          super({});
          this.inputs = inputs;
          this.index = 0;
        }

        _read() {
          if (this.index < this.inputs.length) {
            this.push(Buffer.from(this.inputs[this.index++]));
          } else {
            this.push(null);
          }
        }

        toString() {
          return this.inputs.map((i) => i.toString()).join('');
        }
      }

      class Writer extends Writable {
        #result = '';
        #future = new Future();
        _write(chunk, encoding, callback) {
          this.#result += chunk.toString();
          callback();
        }

        _destroy(err, callback) {
          this.#future.resolve();
          refute(err);
          callback();
        }

        async result() {
          await this.#future.promise;
          return this.#result;
        }
      }

      const send = (inp) => {
        const outp = new Writer();
        const req = {method: 'GET'};
        const path = 'path/mod.js';
        const opts = {opts: 123};
        const res = {once: stub()};
        const unpipe = stub();
        const send = (...args) => {
          assert.same(args[0], req);
          assert.same(args[1], path);
          assert.same(args[2], opts);
          return {
            pipe: (r) => {
              assert.same(r, res);
              assert.calledWith(res.once, 'pipe', m.func);
              res.once.yield({
                unpipe,
                pipe: (tfm) => {
                  assert.calledOnceWith(unpipe, res);
                  const str = inp.pipe(tfm);
                  return {
                    pipe: (r) => {
                      assert.same(r, res);
                      str.pipe(outp);
                    },
                  };
                },
              });
            },
          };
        };
        asyncTransform({method: 'GET'}, 'abc.js')(send, req, path, opts, res);
        return outp.result();
      };

      test('passThrough', async () => {
        for (const n of [
          ['//; testing\n',
           `define(async () => {
await 123;
});`,
          ], [
            `define(async () => {
await 123;
});`,
          ],
        ]) {
          const inp = new Reader(...n);
          assert.same(await send(inp), inp.toString());
        }
      });

      test('simple', async () => {
        const inp = new Reader(`//;no-client-async testing
funcasync += 3;
asyncFunc(async () => {
  await 123;
});`);
        assert.same(await send(inp), inp.toString().replace(/(\n\s*|\()a....\b/g, '$1     '));
      });

      test('split async/await chunk', async () => {
        const inp = new Reader('//;no-client-async testing\n', `asyn`, `cFunc(as`, `ync () => {
awai`, `t 123; async`, `x
});`);
        assert.same(await send(inp), inp.toString().replace(/(\n\s*|\()a....\b/g, '$1     '));
      });

      test('skip single line comments', async () => {
        const inp = new Reader('//;no-client-async testing\n', `// async comment
asyncFunc(async () => {
  await 123;
});`);
        assert.same(await send(inp), inp.toString().replace(/(\n\s*|\()a....\b/g, '$1     '));
      });

      test('disable client-async', async () => {
        const inp = new Reader(`//;no-client-async
define(async (x) => {
  await 123;
});

//;client-async
const foo = async (y) => {
 await 456;
}
//;no-client-async

const bar = async (x) => {
await 123456;
}


`);
        assert.equals(await send(inp), inp.toString().replace(/(?:await|async)(\s+(?:\(x|123))/g, '     $1'));
      });

      test('skip multi line comments', async () => {
        const inp = new Reader(`//;no-client-async testing\n/** async comment
' " **** / */
asyncFunc(async () => {
  await 123;
});`);
        assert.same(await send(inp), inp.toString().replace(/(\n\s*|\()a....\b/g, '$1     '));
      });

      test('skip strings', async () => {
        const inp = new Reader(`//;no-client-async testing
define(async () => {
\` \\\` await foo\`; ' \\\'  async bar() '; " \\\" await 456";
  await 123;
});`);
        assert.same(await send(inp), inp.toString().replace(/(?:await|async)(\s+(?:\(|123))/g, '     $1'));
      });
    });
  });
});
