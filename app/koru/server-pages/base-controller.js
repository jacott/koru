define((require) => {
  'use strict';
  const koru            = require('koru');
  const HtmlDoc         = require('koru/dom/html-doc');
  const HttpUtil        = require('koru/http-util');
  const util            = require('koru/util');

  const rendered$ = Symbol(), promises$ = Symbol(), body$ = Symbol();

  const METHODS = {
    get: 'new',
    post: 'create',
    put: 'update',
    patch: 'update',
    delete: 'destroy',
  };

  const toTpl = (ctl, action) => action === 'index'
        ? ctl.view
        : (ctl.view[action[0].toUpperCase() + action.slice(1)] ?? ctl.view);

  const render = async (ctl, action) => {
    if (action in ctl) {
      const result = await ctl[action]();

      if (ctl[rendered$]) return;

      if (result === null) {
        ctl[rendered$] = true;
        const {response} = ctl;
        response.statusCode = 204;
        response.end();
        return;
      } else if (typeof result == 'object') {
        if ('outerHTML' in result) {
          return ctl.renderHTML(result);
        }
        return ctl.renderJSON(result);
      }
    }

    const tpl = toTpl(ctl, action);
    if (tpl !== undefined) {
      if (! ctl.checkETag()) return ctl.render(tpl.$render(ctl));
      return;
    }

    ctl.error(405, 'Method Not Allowed');
  };

  const HEADER = '<!DOCTYPE html>\n';

  const runParser = async (ctl) => {
    const {action} = ctl;
    if (action !== void 0 && ! ctl[rendered$]) {
      return render(ctl, action);
    }
  };

  class BaseController {
    static async build({view, request, response, pathParts, params}) {
      const bc = new this();
      bc.view = view;
      bc.request = request;
      bc.response = response;
      bc.pathParts = pathParts;
      bc.params = params;
      bc.layoutData = {};
      bc.method = request.method;
      bc[rendered$] = false;
      bc.action = await bc.$parser();
      if (bc.aroundFilter !== undefined) {
        await bc.aroundFilter(runParser);
      } else {
        await runParser(bc);
      }
      return bc;
    }

    get App() {return this.constructor.App}

    get eTag() {return this.constructor.defaultETag}

    checkETag() {
      const reqETag = this.request.headers['if-none-match'];

      if (reqETag === undefined) return false;

      const {eTag} = this, reqETagIdx = reqETag.indexOf('"') + 1;

      if (reqETag.slice(reqETagIdx, eTag.length + reqETagIdx) !== eTag) {
        return false;
      }

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

    addPromise(p) {
      if (this[promises$] === void 0) {
        this[promises$] = [p];
      } else {
        this[promises$].push(p);
      }
    }

    async waitPromises() {
      for (let ps = this[promises$]; ps !== void 0; ps = this[promises$]) {
        this[promises$] = void 0;
        for (const p of ps) await p;
      }
    }

    get rendered() {return this[rendered$]}
    set rendered(v) {this[rendered$] = !! v}

    async getBody() {
      const body = this[body$];
      if (body !== undefined) return body;
      const raw = await HttpUtil.readBody(this.request);
      if (this.request.headers['content-type'].indexOf('application/x-www-form-urlencoded') !== -1) {
        return this[body$] = util.searchStrToMap(raw);
      } else {
        return this[body$] = raw;
      }
    }

    async render(content, {layout=this.App.defaultLayout}={}) {
      await this.renderHTML(layout.$render({controller: this, content}));
    }

    async renderHTML(html) {
      await this.waitPromises();
      const data = html.outerHTML;
      await this.renderContent({
        data, contentType: 'text/html',
        prefix: data.startsWith('<!') ? undefined : HEADER,
        eTag: this.eTag});
    }

    redirect(url, code=302) {
      this[rendered$] = true;
      this.response.writeHead(code, {
        Location: url,
      });
      this.response.end();
    }

    async renderJSON(json) {
      await this.waitPromises();
      await this.renderContent({data: JSON.stringify(json), contentType: 'application/json'})}

    renderContent(opts) {
      this[rendered$] = true;
      HttpUtil.renderContent(this.response, opts);
    }

    $parser() {
      const method = this.method.toLowerCase();
      const allowed = METHODS[method];
      if (allowed === undefined) {
        return void this.error(404);
      }

      if (method in this) {
        return method;
      }
      const {pathParts} = this;
      const action = pathParts.length == 0 ? undefined : pathParts[0];
      switch (method) {
      case 'get':
        if (action === 'new') return action;
        if (action === '' || action === undefined) {
          return 'index';
        }
        this.params.id = action;
        if (pathParts.length > 1 && pathParts[1] === 'edit') {
          return 'edit';
        } else {
          return 'show';
        }
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
