isServer && define((require, exports, module) => {
  'use strict';
  const TH              = require('koru/test');
  const api             = require('koru/test/api');

  const {stub, spy, util} = TH;

  const JsPrinter = require('./js-printer');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    test('new', () => {
      /**
       * Create a new javascript printer
       */
      const JsPrinter = api.class();
      //[
      const example = () => {
        return 1+2;
      };
      let output = '';
      const simple = new JsPrinter({
        input: example.toString(),
        write: (token) => {
          output += token;
        },
      });

      simple.print(simple.ast);

      simple.catchup(simple.ast.end);

      assert.same(output, example.toString());
      //]
    });

    test('comments', () => {
      const input = `(\n   // c1 \n \n \n    f, /*xx*/  /*(*/1,/*<*/2/*>*/,3/*)*/)`;
      let output = '';
      let comments = [];
      const simple = new JsPrinter({
        input,
        write: (token, type) => {
          if (type === 'comment') {
            comments.push(token);
          }
          output += token;
        },
      });

      simple.print(simple.ast);
      simple.catchup(simple.ast.end);
      assert.same(output, input);
      assert.equals(comments, ['\n   // c1 \n \n \n', ' /*xx*/', '  /*(*/', '/*<*/', '/*>*/', '/*)*/']);
    });

    test('writeCatchup', () => {
      let output = [];
      const simple = new JsPrinter({
        input: '',
        write: (token, type) => {
          assert.same(type, 'catchup');
          output.push(token)},
      });

      const assertOutput = (input, expect) => {
        simple.writeCatchup(input);
        assert.equals(output, expect);
        output = [];
      };

      assertOutput('\nhello\n\nnew\nworld', ['\n', 'hello', '\n', '\n', 'new', '\n', 'world']);
      assertOutput('hello new world', ['hello new world']);
      assertOutput('\n\n\n', ['\n', '\n', '\n']);
    });

    test('writeAdvance', () => {
      const input = `(/*(*/1,/*<*/2/*>*/,3/*)*/)`;
      let output = '';
      class Mine extends JsPrinter {
        NumericLiteral(node) {
          const v = node.value.toString();
          const point = this.indexOf(v, this.inputPoint);
          this.advance(point - v.length);
          this.write("'");
          this.write(v);
          this.write("'");
          this.advance(point);
        }
        SequenceExpression(node) {
          this.write('[');
          this.print(node.expressions);
          this.write(']');
        }
      }
      const simple = new Mine({
        input,
        write: (token, type) => {output += token},
      });

      simple.print(simple.ast);
      simple.catchup(simple.ast.end);
      assert.same(output, "(/*(*/['1',/*<*/'2'/*>*/,'3']/*)*/)");
    });
  });
});
