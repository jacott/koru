define((require, exports, module) => {
  'use strict';
  const TH              = require('koru/test');

  const {stub, spy, util} = TH;

  const CodeIndentation = require('./code-indentation');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    let ci;
    beforeEach(() => {
      ci = new CodeIndentation();
    });

    const append = (...list) => {
      for (const n of list) ci.append(n);
    };

    test('string types', () => {
      ci = new CodeIndentation({initialIndent: 0});
      ci.append(')', 'template');
      ci.append(')', 'template');
      ci.newLine('\n');
      assert.same(ci.output, '))');
      ci.append(')', 'string');
      ci.newLine('\n');
      assert.same(ci.output, ')))');
      ci.append(')', 'comment');
      ci.newLine('\n');
      assert.same(ci.output, '))))');
    });

    test('initialIndent', () => {
      ci = new CodeIndentation({initialIndent: 2});
      append(...'a\nb\nc'.split(''));
      assert.equals(ci.complete(), '  a\n  b\n  c');
    });

    test('appendComment', () => {
      append('if ', '(', 'x ||');
      ci.appendComment('   // hello(  \n');
      append('abc', ')', ' ', '{', '\n');
      append('123', '\n');
      ci.appendComment('\n\n\n   /** 1\n*   2\n**/   \n');
      append('\n', '\n', 'const ', '{', '\n', 'a', '\n', '}', ' = 123');
      ci.appendComment('   /***\n   1  \n   2\n*/');
      assert.equals(ci.complete(),
                    'if (x ||   // hello(\n' +
                    '    abc) {\n' +
                    '  123\n' +
                    '\n' +
                    '\n' +
                    '\n' +
                    '  /** 1\n' +
                    '   *   2\n' +
                    '   **/\n' +
                    '\n' +
                    '\n' +
                    '  const {\n' +
                    '    a\n' +
                    '          } = 123   /***\n' +
                    '          1\n' +
                    '          2\n' +
                    '          */',
                   );
    });
  });
});
