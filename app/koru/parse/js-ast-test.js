isServer && define((require, exports, module) => {
  'use strict';
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

    test('scope', () => {
      const aa = (() => {
        const a = 1;
        let c = (() => {
          let cc = () => cc;
          if (++d < 5) e(c);
        })();
        function f() {}
        class g extends f(() => {}) {
          m() {
            return () => {};
          }
        }
        var d = 1;
        let e = () => {
          const b = 2;
          return c;
        };
        e();
      }).toString();

      const ast = JsAst.parse(aa);
      const types = [];

      JsAst.scopeWalk(ast, (path) => {
        if (path.node.type === 'ArrowFunctionExpression') {
          const {start} = path.node;
          const bindings = Object.entries(path.scope.getAllBindings()).filter(([n, v]) => {
            return v.isLive;
          }).map(([n]) => n);

          types.push(aa.slice(aa.lastIndexOf('\n', start) + 1, aa.indexOf('\n', start))+': '+
                     bindings.join(','));
        }
      });

      assert.equals(types.join('\n'),
                    '() => {: \n' +
                    '        let c = (() => {: f,d,a,c\n' +
                    '          let cc = () => cc;: cc,f,d,a,c\n' +
                    '        class g extends f(() => {}) {: f,d,a,c\n' +
                    '            return () => {};: f,d,a,c,g\n' +
                    '        let e = () => {: f,d,a,c,g,e'
                   );
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
