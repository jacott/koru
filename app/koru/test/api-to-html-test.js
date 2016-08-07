isServer && define(function (require, exports, module) {
  var test, v;
  const apiToHtml = require('./api-to-html');
  const TH        = require('./main');

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
    },

    tearDown() {
      v = null;
    },

    "test markdown simple text"() {
      const div = document.createElement('div');
      apiToHtml.markdown(div, 'hello');
      apiToHtml.markdown(div, 'world');
      apiToHtml.markdown(div, ' *bold*');
      apiToHtml.markdown(div, '.\n');
      apiToHtml.markdown(div, 'nlBefore');
      assert.equals(div.outerHTML, '<div>helloworld <em>bold</em>. nlBefore</div>');
    },

    "test markdown list"() {
       const div = document.createElement('div');
      apiToHtml.markdown(div, ' before\n\n* one\n* two');
      assert.equals(div.outerHTML, '<div> before\n<ul>\n<li>one</li>\n<li>two</li>\n</ul>\n</div>');
    },
  });
});
