isServer && define((require, exports, module)=>{
  'use strict';
  const TH              = require('koru/test');

  const {stub, spy, util} = TH;

  const JsAst = require('./js-ast');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    test('classProperties', ()=>{
      class A {
        b = 123;
      }

      const ast = JsAst.parse(A.toString());

      const types = [];

      JsAst.walk(ast, node => {
        types.push(node.type);
        return 1;
      });

      assert.equals(types, [
        'Program', 'ClassDeclaration', 'Identifier', 'ClassBody',
        'ClassProperty', 'Identifier', 'NumericLiteral']);

    });
  });
});
