isServer && define((require, exports, module)=>{
  'use strict';
  const Compilers       = require('koru/compilers');
  const Dom             = require('koru/dom');
  const ServerPages     = require('koru/server-pages/main');
  const TH              = require('koru/test-helper');

  const {stub, spy, onEnd, util} = TH;

  const sut = require('./markdown-helper');

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    test("markdown helper", ()=>{
      const webServer = {registerHandler() {}};
      const sp = new ServerPages(webServer, 'koru/server-pages/test-pages');
      spy(Compilers, 'read');
      assert.equals(Dom._helpers.markdown.call({controller: {App: sp}}, "test"),
                    '<h1 id=\"heading\">Heading</h1>\n');

      assert.calledWith(Compilers.read, 'md', TH.match(/test-pages\/test\.md/),
                        TH.match(/test-pages\/\.build\/test\.md\.html/));
    });
  });
});
