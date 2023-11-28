isServer && define((require, exports, module) => {
  'use strict';
  const Compilers       = require('koru/compilers');
  const Dom             = require('koru/dom');
  const Ctx             = require('koru/dom/ctx');
  const fst             = require('koru/fs-tools');
  const BaseController  = require('koru/server-pages/base-controller');
  const ServerPages     = require('koru/server-pages/main');
  const TH              = require('koru/test-helper');

  const {private$} = require('koru/symbols');

  const {stub, spy, util} = TH;

  const Helpers = require('./helpers');

  TH.testCase(module, ({after, beforeEach, afterEach, group, test}) => {
    let MyController, sp, controller;
    beforeEach(async () => {
      MyController = class extends BaseController {};
      const webServer = {registerHandler() {}};
      sp = await ServerPages.build(webServer, 'koru/server-pages/test-pages');
      sp.addViewController('foo', {}, MyController);
      controller = new MyController();
    });

    test('page helper', () => {
      assert.equals(Dom._helpers.page.call({controller: {pathParts: []}}), 'root');
      assert.equals(Dom._helpers.page.call({controller: {pathParts: ['show']}}), 'show');
    });

    test('controllerId helper', () => {
      assert.equals(Dom._helpers.controllerId.call({controller: new MyController()}), 'foo');
    });

    test('markdown helper', async () => {
      spy(Compilers, 'read');

      const node = Dom._helpers.markdown.call({controller}, 'test');

      assert.same(node.data, '');

      await controller.waitPromises();

      assert.match(node.data, '<h1 id="heading">Heading</h1>\n');

      assert.calledWith(Compilers.read, 'md', TH.match(/test-pages\/test\.md/),
        TH.match(/test-pages\/\.build\/test\.md\.html/));
    });

    test('less helper', async () => {
      spy(Compilers, 'read');

      const node = Dom._helpers.less.call({controller}, 'layouts/default');

      await controller.waitPromises();

      assert.match(node.data,
        /background-color:\s*#112233;[\s\S]*sourceMappingURL/);

      assert.calledWith(Compilers.read, 'less', TH.match(/layouts\/default\.less/),
        TH.match(/layouts\/\.build\/default\.less\.css/));
    });

    test('css helper', async () => {
      const textNode = {};
      stub(fst, 'readFile').returns(Promise.resolve({toString() {return 'css-output'}}));

      const node = Dom._helpers.css.call({controller}, 'my-css-page');

      await controller.waitPromises();

      assert.equals(node.data, 'css-output');

      assert.calledWith(fst.readFile, sp._pageDirPath + '/my-css-page.css');
    });

    test('not found', async () => {
      const node = Dom._helpers.markdown.call({controller}, 'test-not-found');
      await controller.waitPromises();

      assert.match(node.data, '');
    });

    test('error', async () => {
      stub(Compilers, 'read').returns(Promise.reject(new Error('testing')));
      const node = Dom._helpers.markdown.call({controller}, 'test-not-found');

      await assert.exception(
        () => controller.waitPromises(),
        {message: 'testing'},
      );

      assert.match(node.data, '');
    });
  });
});
