define(function(require, exports, module) {
  const koru            = require('koru');
  const HtmlDoc         = require('koru/dom/html-doc');
  const HttpUtil        = require('koru/http-util');
  const util            = require('koru/util');

  const rendered$ = Symbol(), body$ = Symbol();

  const METHODS = {
    get: 'new',
    post: 'create',
    put: 'update',
    patch: 'update',
    delete: 'destroy',
  };

  const toTpl = (ctl, action)=> action === 'index'
        ? ctl.view : (ctl.view[action[0].toUpperCase()+action.slice(1)] || ctl.view);

  const render = (ctl, action)=>{
    if (action in ctl) {
      const result = ctl[action]();

      if (ctl[rendered$])  return;

      if (result === null) {
        ctl[rendered$] = true;
        const {response} = ctl;
        response.statusCode = 204;
        response.end();
        return;
      } else if (typeof result == 'object') {
        if ('outerHTML' in result) {
          ctl.renderHTML(result);
        } else {
          ctl.renderJSON(result);
        }
        return;
      }
    }

    const tpl = toTpl(ctl, action);
    if (tpl !== undefined) {
      ctl.checkETag() || ctl.render(tpl.$render(ctl));
      return;
    }

    ctl.error(405, 'Method Not Allowed');
  };

  const HEADER = '<!DOCTYPE html>\n';

  const runParser = (ctl)=>{
    const {action} = ctl;
    if (action !== undefined && ! ctl[rendered$]) {
      render(ctl, action);
    }
  };


  class BaseController {
    constructor({view, request, response, pathParts, params}) {
      this.view = view;
      this.request = request;
      this.response = response;
      this.pathParts = pathParts;
      this.params = params;
      this.layoutData = {};
      this.method = request.method;
      this[rendered$] = false;
      this.action = this.$parser();
      if (this.aroundFilter !== undefined) {
        this.aroundFilter(()=>{runParser(this)});
      } else
        runParser(this);
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

    get rendered() {return this[rendered$]}
    set rendered(v) {this[rendered$] = !! v}

    get body() {
      const body = this[body$];
      if (body !== undefined) return body;
      const raw = HttpUtil.readBody(this.request);
      if (this.request.headers['content-type'].indexOf('application/x-www-form-urlencoded') !== -1) {
        return this[body$] = util.searchStrToMap(raw);
      } else
        return this[body$] = raw;
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

    redirect(url, code=302) {
      this[rendered$] = true;
      this.response.writeHead(code, {
        'Location': url
      });
      this.response.end();
    }

    renderJSON(json) {this.renderContent({data: JSON.stringify(json), contentType: 'application/json'})}

    renderContent(opts) {
      this[rendered$] = true;
      HttpUtil.renderContent(this.response, opts);
    }



    $parser() {
      const method = this.method.toLowerCase();
      const allowed =METHODS[method];
      if (allowed === undefined)
        return void this.error(404);

      if (method in this) {
        return method;
      }
      const {pathParts} = this;
      const action = pathParts.length == 0 ? undefined : pathParts[0];
      switch(method) {
      case 'get':
        if (action === 'new') return action;
        if (action === '' || action === undefined)
          return 'index';
        this.params.id = action;
        if (pathParts.length > 1 && pathParts[1] === 'edit')
          return 'edit';
        else
          return 'show';
      case 'post':
        return allowed;
      default:
        this.params.id = action;
        return allowed;
      }
    }
  }

  BaseController.defaultETag = koru.versionHash;

  return BaseController;
});
