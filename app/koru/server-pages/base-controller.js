define(function(require, exports, module) {
  const koru            = require('koru');
  const HtmlDoc         = require('koru/dom/html-doc');
  const HttpUtil        = require('koru/http-util');
  const util            = require('koru/util');

  const rendered$ = Symbol(), body$ = Symbol();

  const render = (ctl, action)=>{
    if (action in ctl) {
      const result = ctl[action]();

      if (ctl[rendered$] === undefined) {
        const da = defaultActions[action];
        if (da === undefined) {
          if (result === undefined) {
            const {response} = ctl;
            response.statusCode = 204;
            response.end();
          } else if ('outerHTML' in result) {
            ctl.renderHTML(result);
          } else {
            ctl.renderJSON(result);
          }
        } else {
          da(ctl);
        }
      }
    } else
      ctl.error(405, 'Method Not Allowed');
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

  const HEADER = '<!DOCTYPE html>\n';

  class BaseController {
    constructor({view, request, response, pathParts, params}) {
      this.view = view;
      this.request = request;
      this.response = response;
      this.pathParts = pathParts;
      this.params = params;
      this.layoutData = {};
      const action = this.$parser();
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

      this[rendered$] = true;
      this.response.statusCode = 304;
      this.response.end();

      return true;
    }

    error(code, message) {
      this[rendered$] = true;
      const res = this.response;
      res.statusCode = code;
      res.end(message);
    }

    get body() {
      const body = this[body$];
      if (body !== undefined) return body;
      return this[body$] = HttpUtil.readBody(this.request);
    }

    render(content, {layout=this.App.defaultLayout}={}) {
      this.renderHTML(layout.$render({controller: this, content}));
    }

    renderHTML(html) {
      const data = html.outerHTML;
      this.renderContent({
        data, contentType: 'text/html',
        prefix: data.slice(0,2) === '<!' ? undefined : HEADER,
        eTag: this.eTag});
    }

    renderJSON(json) {this.renderContent({data: JSON.stringify(json), contentType: 'application/json'})}

    renderContent(opts) {
      this[rendered$] = true;
      HttpUtil.renderContent(this.response, opts);
    }

    index() {return defaultActions.index(this)}

    show() {return defaultActions.show(this)}

    $parser() {
      const method = this.request.method.toLowerCase();

      if (method === 'get') {
        const {pathParts} = this;
        let action = 'index';
        if (pathParts[0] !== undefined) {
          this.params.id = pathParts[0];
          action = 'show';
        }
        render(this, action);
        return;
      }

      render(this, method);
    }
  }

  BaseController.defaultETag = koru.versionHash;

  return BaseController;
});
