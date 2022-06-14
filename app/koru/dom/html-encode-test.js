define((require, exports, module) => {
  'use strict';
  const TH              = require('koru/model/test-db-helper');

  const {stub, spy, util} = TH;

  const HtmlEncode = require('./html-encode');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    beforeEach(() => TH.startTransaction());
    afterEach(() => TH.rollbackTransaction());

    test('unescape simple text', () => {
      const text = '&#97;&#x64;&#109;&#105;&#x6e;&#64;&#x74;&#x72;&#97;&#x69;&#x6e;&#105;&#x6e;' +
            '&#103;&#x73;&#x69;&#x6d;&#x73;&#46;&#x63;&#111;&#109;';

      assert.equals(HtmlEncode.unescapeHTML(text), 'admin@trainingsims.com');
    });

    test('unescape, escape ', () => {
      const text = HtmlEncode.unescapeHTML('&amp;&lt;hello>');
      assert.equals(text, '&<hello>');

      assert.equals(HtmlEncode.escapeHTML(text), '&amp;&lt;hello&gt;');
    });
  });
});
