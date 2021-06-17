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
        writer: (token) => {
          output += token;
        }});

      simple.print(simple.ast);

      assert.same(output, example.toString());
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
          this.writer(this.input.slice(node.start, node.end)
                          .replace(/comment/ig, 'COMMENT'));
          this.inputPoint = node.end;
        }
      }

      let output = '';
      const simple = new MyPrinter({
        input: exampleComment.toString(),
        writer: (token) => {
          output += token;
        }});

      simple.print(simple.ast);

      assert.same(output, exampleComment.toString().replace(/\bcomment\b/g, 'COMMENT'));
      //]
    });
  });
});
