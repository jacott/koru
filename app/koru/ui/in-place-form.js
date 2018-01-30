define(function(require, exports, module) {
  const Dom    = require('../dom');
  const util   = require('../util');
  const Dialog = require('./dialog');
  const Form   = require('./form');

  const Tpl = module.exports = Dom.newTemplate(require('../html!./in-place-form'));
  const $ = Dom.current;

  class Widget {
    constructor (options) {
      const element = this.element = Tpl.$autoRender(options);
      const ctx = this.ctx = Dom.ctx(element);
      ctx._widget = this;
    }

    onSubmit(func) {
      this._onSubmit = func;
    }

    onDelete(func) {
      this._onDelete = func;
    }

    close() {
      if (this.swap) {
        this.element.parentNode.replaceChild(this.swap, this.element);
        this.swap = null;
      }
      Dom.remove(this.element);
    }
  };

  Tpl.$helpers({
    htmlAttrs() {
      var options = this;
      var elm = $.element;

      for(var key in options) {
        var m = /^html-form-(.*)$/.exec(key);
        if (m)
          elm.setAttribute(m[1], options[key]);
      }
    },

    field() {
      var options = this;

      if (options.editTpl) return options.editTpl.$autoRender(options);

      var fieldOptions = {
        type: options.type,
      };

      for(var key in options) {
        var m = /^html-(form-)?(.*)$/.exec(key);
        if (m && !m[1])
          fieldOptions[m[2]] = options[key];
      }

      var name = options.name || 'name';
      var doc = options.doc;
      if (! doc) {
        doc = {};
        doc[name] = options.value;
      }

      return Dom.Form.field(doc, name, fieldOptions, options);
    },

    deleteButton() {
      var elm = $.element;

      if (! this.deleteName)
        return '';

      if (! elm.tagName !== 'BUTTON') {
        elm =document.createElement('button');
        elm.setAttribute('type', 'button');
        elm.setAttribute('name', 'delete');
        elm.textContent = this.deleteName;
      }

      return elm;
    },

    applyName() {
      return this.applyName || 'Apply';
    },
  });

  Tpl.GenericShow.$helpers({
    label() {
      return util.capitalize(util.humanize(this.options.name));
    },
    name() {
      return this.options.name;
    },

    classes() {
      return this.options.name+"-field";
    },
    value() {
      return this.doc[this.options.name];
    },
  });

  function submit(event) {
    Dom.stopEvent();

    var ctx = Dom.ctx(this);
    var widget = ctx._widget;

    var input = this.firstChild;

    var value = input.value;

    widget._onSubmit && widget._onSubmit(value, this);
  }

  Tpl.$events({
    'submit': submit,

    'keydown'(event) {
      switch (event.which) {
      case 13:
        if (! event.shiftKey && (event.ctrlKey || $.ctx.data.enterSubmits)) {
          Dom.stopEvent();
          submit.call(this, event);
        }
        break;
      case 27:
        Dom.stopEvent();
        cancel(this);
        break;
      }
    },

    'click [name=delete]'(event) {
      Dom.stopEvent();
      var ctx = Dom.ctx(this);
      var widget = ctx._widget;

      Dialog.confirm({
        classes: 'warn cl',
        okay: 'Delete',
        content: ctx.data.deleteConfirmMsg || 'Are you sure you want to delete this?',
        callback(confirmed) {
          if (confirmed) {
            widget._onDelete && widget._onDelete();
          }
        },
      });
    },

    'click [name=cancel]'(event) {
      Dom.stopEvent();
      cancel(this);
    },
  });


  Tpl.$extend({
    $created(ctx, elm) {
      var editTpl = ctx.data && ctx.data.editTpl;
      if (editTpl && '$opened' in editTpl) {
        editTpl.$opened(elm);
      }
    },
    newWidget(options) {
      return new Widget(options);
    },

    swapFor(elm, options) {
      var widget = new Widget(options);
      elm.parentNode.replaceChild(widget.element, elm);
      widget.swap = elm;

      var focus = widget.element.querySelector(Dom.INPUT_SELECTOR);
      focus && focus.focus();

      return widget;
    },

    autoRegister(template, func) {
      template.$events({
        'click .ui-editable'(event) {
          Dom.stopEvent();
          const range = Dom.getRange();
          if (range !== null && ! range.collapsed) return;
          const target = this;
          if (Dom.matches(target, '.readOnly *')) return;
          var ctx = Dom.ctx(target);
          ctx.options.value = (ctx.options.doc = ctx.data.doc)[ctx.options.name];
          var widget = Tpl.swapFor(target, ctx.options);
          widget.onSubmit(function (value, form) {
            var doc = ctx.data.doc;
            doc.$reload();
            doc[ctx.options.name] = value;
            if (func) {
              Dom.addClass(form, 'submitting');
              if (func.call(widget, doc, ctx.options.name, value, form) === 'exit')
                return;
            }
            Tpl.saveField(doc, form, this);
          });
        },
      });
      return this;
    },

    saveField(doc, form, widget) {
      if (doc._errors === undefined) for(const _ in doc.changes) {
        doc.$save();
        break;
      }
      if (doc._errors !== undefined) {
        Dom.removeClass(form, 'submitting');
        Dom.Form.renderErrors(doc, form);
      } else {
        widget == null || widget.close(form);
      }

    },
  });

  Dom.registerHelpers({
    editInPlace(options) {
      var elm = $.element;

      if (elm.nodeType !== document.ELEMENT_NODE) {
        var pTpl = $.ctx.template;
        var tpl = pTpl[options.showTemplate||'Show_'+options.name] || Tpl.GenericShow;
        elm = tpl.$render();
        var ctx = Dom.ctx(elm);
        options.editTpl = pTpl[options.editTemplate||'Edit_'+options.name];
        ctx.options = options;
      } else {
        var ctx = Dom.ctx(elm);
      }

      ctx == null || ctx.updateAllTags({doc: this, options: options});

      return elm;
    },
  });

  function cancel(elm) {
    var ctx = Dom.ctx(elm);
    var data = ctx.data;
    data && data.doc && data.doc.$reload();
    ctx._widget.close();
  }
});
