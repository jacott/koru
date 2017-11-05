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
      ctl.render(ctl.constructor.View.$render(ctl));
    },
    show: ctl =>{
      const {View} = ctl.constructor;
      ctl.render((View.Show||View).$render(ctl));
    },
  };

  class BaseController {
    constructor({request, response, pathParts, params}) {
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

    render(elm, {layout=this.App.defaultLayout}={}) {
      this[rendered$] = true;
      this.response.write('<!DOCTYPE html>\n');
      this.response.end(layout.$render({controller: this, content: elm}).outerHTML);
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