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
        return 1 + 2;
      };
      let output = '';
      const simple = new JsPrinter({
        input: example.toString(),
        write: (token) => {
          output += token;
        }});

      simple.print(simple.ast);

      simple.catchup(simple.ast.end);

      assert.same(output, example.toString());
      //]
    });

    test('lookingAt', () => {
      api.protoMethod();
      //[
      const input = (() => {let abc=123}).toString();
      let output = '';
      const p = new JsPrinter({input , write: (token) => {output += token}});
      assert(p.lookingAt(/^[^\n]+123/));
      //]
    });

    test('addComment', () => {
      /**
       * Handle comments
       */
      api.protoMethod();
      //[
      const exampleComment = () => {
        // start comment
        {
          return exampleComment + /* middle comment */ 2;
        }
        // end comment
      };

      class MyPrinter extends JsPrinter {
        addComment(node) {
          this.write(this.input.slice(node.start, node.end)
                     .replace(/comment/ig, 'COMMENT'));
          this.inputPoint = node.end;
        }
      }

      let output = '';
      const simple = new MyPrinter({
        input: exampleComment.toString(),
        write: (token) => {
          output += token;
        }});

      simple.print(simple.ast);

      simple.catchup(simple.ast.end);

      assert.same(output, exampleComment.toString().replace(/\bcomment\b/g, 'COMMENT'));
      //]
    });
  });
});
