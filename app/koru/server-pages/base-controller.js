define(function(require, exports, module) {
  const util  = require('koru/util');

  const rendered$ = Symbol();

  const render = (ctl, action)=>{
    const result = ctl[action]();
    if (ctl[rendered$] === undefined)
      defaultActions[action](ctl);
  };

  const defaultActions = {
    index: ctl =>{
      ctl.render(ctl.view.$render(ctl));
    },
    show: ctl =>{
      const {view} = ctl;
      ctl.render((view.Show||view).$render(ctl));
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

    render(content, {layout=this.App.defaultLayout}={}) {
      const data = layout.$render({controller: this, content}).outerHTML;
      const headerLen = data.slice(0,2) === '<!' ? 0 : HEADER_LEN;
      this[rendered$] = true;
      this.response.writeHead(200, {
        'Content-Length': HEADER_LEN+Buffer.byteLength(data, 'utf8'),
        'Content-Type': 'text/html; charset=utf-8',
      });
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

  return BaseController;
});
