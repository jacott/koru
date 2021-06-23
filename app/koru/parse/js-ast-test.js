isServer && define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const fst             = require('koru/fs-tools');
  const TH              = require('koru/test');

  const {stub, spy, util} = TH;

  const JsAst = require('./js-ast');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    test('classProperties', () => {
      class A {
        b = 123;
      }

      const ast = JsAst.parse(A.toString());

      const types = [];

      JsAst.walk(ast, (node) => {
        types.push(node.type);
        return 1;
      });

      assert.equals(types, [
        'Program', 'ClassDeclaration', 'Identifier', 'ClassBody',
        'ClassProperty', 'Identifier', 'NumericLiteral']);
    });

    group('scopeWalk', () => {
      const assertScope = (text) => {
        text = text.toString();
        let sidx = 0;
        const asserts = {};
        while (sidx != -1) {
          sidx = text.indexOf('assert(', sidx);
          if (sidx == -1) break;
          const eidx = text.indexOf(')', sidx+5);
          asserts[sidx] = {text: 'fail.notFound' + text.slice(sidx+6, eidx+1)};
          sidx = eidx;
        }
        JsAst.scopeWalk(JsAst.parse(text), (node, scope) => {
          if (node.type === 'Identifier' && node.name === 'assert') {
            const sidx = node.end+1;
            const eidx = text.indexOf(')', sidx);
            const vars = text.slice(sidx, eidx);

            if (asserts[node.start].where !== void 0) {
              koru.unhandledException(asserts[node.start].where);
              assert.fail('DOUBLE PARSE!');
            }

            const bvars = Object.entries(scope.getAllBindings())
                  .map(([k, {isLive}]) => (isLive === true ? '' : '!')+k).join(', ');

            asserts[node.start] = {
              where: new Error('First parse'),
              text: bvars !== vars ? `fail([${vars}] != [${bvars}])` : `pass(${vars})`};
          }
        });

        let fail = false
        const result = Object.entries(asserts).map(([k, {text}]) => {
          if (text.indexOf('fail') != -1) fail = true;
          return ' at '+k+'> '+text;
        }).join('\n');
        if (fail) {
          assert.fail('scope mismatch:\n'+result, 1);
        } else {
          assert(true);
        }
      };

      test('hoisting', () => {
        assertScope(() => {
          var i = (() => {
            assert(j, m, q, k, i);

            if (i) {
              var j = assert(j, m, q, k, i);
            }

            while (i) {
              assert(j, m, q, k, i);

              var m;
              let h = 0;

              do {
                assert(m, h, j, q, k, i);
                var q;

                {
                  function k() {
                    assert(hh, k, q, m, h, j, i);
                    var hh = (xx) => assert(xx, hh, k, q, m, h, j, i);
                    let aa = function () {
                      assert(hh, !aa, k, q, m, h, j, i);
                    }

                    class A {
                      m(mm) {
                        var ll;
                        assert(ll, mm, hh, aa, A, k, q, m, h, j, i);
                      }
                    }
                    assert(hh, aa, A, k, q, m, h, j, i);
                  }
                }
              } while(h);
            }
          })();
        });
      });

      test('params', () => {
        assertScope(() => {
          var hh = (xx) => assert(xx, hh);
        });
        assertScope(() => {
          const c = () => function a(b) {assert(a, b, !c)};
          assert(c);
        });

        assertScope(() => {
          function x(a, {b, c: {d: e=123}, f: [g=((h) => assert(h, x, a, b, e, !g))(1), [i]]}) {
            assert(x, a, b, e, g, i);
          }
          x(1, {c: {}, f: [void 0, []]});
        });
      });

      test('array assignment', () => {
        assertScope(() => {
          let [[b=((c) => {
            assert(c, !b);
          })()]] = [[]];

          assert(b);
        })
      });

      test('simple', () => {
        assertScope(() => {let i; assert(i)});
      });

      test('assignment', () => {
        assertScope(() => {const i = assert(!i), j = assert(i, !j); let k = assert(i, j, !k)});
      });

      test('for', () => {
        assertScope((() => {
          for (let i = assert(!i), j=assert(i, !j); assert(i, j), i < 10; ++i, assert(i, j)) {
            assert(i, j);
          }
          assert();
        }));
      });

      test('for in', () => {
        assertScope(() => {
          for (const i in {}) {return assert(i)}
          assert();
        });
      });

      test('complex vars', () => {
        assertScope(() => {
          const q = 123;
          let z = 0;
          assert(q, z);
          const {aa, a: {b: c=(() => {
            let e = 123+c;
            assert(e, q, z, aa, !c);
          })()}, d: [f, [g=(assert(q, z, aa, c, f, !g), 456)]]} = {};
          assert(q, z, aa, c, f, g);
        });
      });

      test('class and functions', () => {
        assertScope(() => {
          assert(f, d);
          const a = 1;

          let c = (() => {
            assert(a, !c, f, d);
            let cc = () => assert(!cc, a, !c, f, d);
            if (++d < 5) e(c);
          })();

          function f() {
            assert(f, a, c, d);
          }

          class g extends f(() => assert(a, c, !g, f, d)) {
            m() {
              return () => assert(a, c, g, f, d);
            }
          }

          var d = 1;

          let e = () => {
            const b = 2;
            assert(b, a, c, g, d, !e, f);
            return c;
          };
          e();
        });
      });
    });

    test('inferVisitorKeys', () => {
      const code = fst.readFile(module._dir + '../../../lib/sample-full-grammar.js').toString();

      const inferredKeys = {};

      const inferVisitorKeys = (ast) => {
        const keys = JsAst.inferVisitorKeys(ast);
        const ik = inferredKeys[ast.type];
        if (ik === void 0) {
          return inferredKeys[ast.type] = keys;
        }
        if (util.shallowEqual(ik, keys)) {
          return ik;
        }

        const [a, b] = util.trimMatchingSeq(ik, keys);

        if (a.length == 0) {
          return inferredKeys[ast.type] = keys;
        } else if (b.length == 0) {
          return ik;
        }

        const idx = ik.indexOf(a[0]);
        for (const n of b) {
          if (ik.indexOf(n) == -1) {
            ik.splice(idx, 0, n);
          }
        }
        return ik
      };

      const walk = (ast) => {
        for (const key of inferVisitorKeys(ast)) {
          const node = ast[key];
          if (node !== null && typeof node === 'object') {
            if (Array.isArray(node)) {
              for (const n of node) walk(n);
            } else {
              walk(node);
            }
          }
        }
      };

      walk(JsAst.parse(code, {sourceType: 'module', ...JsAst.defaultOptions}));

      assert.equals(inferredKeys, JsAst.VISITOR_KEYS);
    });
  });
});
