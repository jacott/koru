define(function(require, exports, module) {
  const koru            = require('koru');
  const util            = require('koru/util');

  const rendered$ = Symbol();

  const render = (ctl, action)=>{
    const result = ctl[action]();
    if (ctl[rendered$] === undefined)
      defaultActions[action](ctl);
  };

  const defaultActions = {
    index: ctl =>{
      ctl.checkETag() || ctl.render(ctl.view.$render(ctl));
    },
    show: ctl =>{
      const {view} = ctl;
      ctl.checkETag() || ctl.render((view.Show||view).$render(ctl));
    },
  };

  const HEADER = '<!DOCTYPE html>\n', HEADER_LEN = HEADER.length;

  class BaseController {
    constructor({view, request, response, pathParts, params}) {
      this.view = view;
      this.request = request;
      this.response = response;
      this.pathParts = pathParts;
      this.params = params;
      const action = this.$parser(pathParts);
      if (action !== undefined && this[rendered$] === undefined) {
        render(this, action);
      }
    }

    get App() {return this.constructor.App}

    get eTag() {return this.constructor.defaultETag}

    checkETag() {
      const reqETag = this.request.headers['if-none-match'];
      if (reqETag === undefined || reqETag.replace(/^[^"]*"([^"]*)"[\s\S]*$/, '$1') !== this.eTag)
        return false;

      this.response.statusCode = 304;
      this.response.end('Not Modified');
      return true;
    }

    render(content, {layout=this.App.defaultLayout}={}) {
      const data = layout.$render({controller: this, content}).outerHTML;
      const headerLen = data.slice(0,2) === '<!' ? 0 : HEADER_LEN;
      this[rendered$] = true;
      const header = {
        'Content-Length': HEADER_LEN+Buffer.byteLength(data, 'utf8'),
        'Content-Type': 'text/html; charset=utf-8',
      };
      const {eTag} = this;
      if (eTag !== undefined)
        header.ETag = `W/"${eTag}"`;
      this.response.writeHead(200, header);
      if (headerLen !== 0) this.response.write(HEADER);
      this.response.end(data);
    }

    index() {return defaultActions.index(this)}

    show() {return defaultActions.show(this)}

    $parser(pathParts) {
      switch(pathParts[0]) {
      case undefined:
        render(this, 'index');
        break;
      default:
        this.params.id = pathParts[0];
        render(this, 'show');
      }
    }
  }

  BaseController.defaultETag = koru.versionHash;

  return BaseController;
});
