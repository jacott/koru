define((require) => {
  'use strict';
  const Dom             = require('koru/dom');
  const Dialog          = require('koru/ui/dialog');
  const Form            = require('koru/ui/form');
  const util            = require('koru/util');

  const widget$ = Symbol();

  const {error$} = require('koru/symbols');

  const Tpl = Dom.newTemplate(require('../html!./in-place-form'));
  const $ = Dom.current;

  class Widget {
    constructor(options) {
      const element = this.element = Tpl.$autoRender(options);
      const ctx = this.ctx = Dom.ctx(element);
      ctx[widget$] = this;
    }

    onSubmit(func) {
      this._onSubmit = func;
    }

    onDelete(func) {
      this._onDelete = func;
    }

    close() {
      if (this.swap !== void 0) {
        const pn = this.element.parentNode;
        pn.replaceChild(this.swap, this.element);
        pn.querySelector(Dom.WIDGET_SELECTOR)?.focus();
        this.swap = void 0;
      }
      Dom.remove(this.element);
    }
  }

  Tpl.$helpers({
    htmlAttrs() {
      const elm = $.element;

      for (const key in this) {
        const m = /^html-form-(.*)$/.exec(key);
        if (m !== null) {
          elm.setAttribute(m[1], this[key]);
        }
      }
    },

    field() {
      if (this.editTpl) return this.editTpl.$autoRender(this);

      const fieldOptions = {
        type: this.type,
      };

      for (const key in this) {
        const m = /^html-(form-)?(.*)$/.exec(key);
        if (m !== null && m[1] === void 0) {
          fieldOptions[m[2]] = this[key];
        }
      }

      const name = this.name ?? 'name';
      let {doc} = this;
      if (doc == null) {
        doc = {};
        doc[name] = this.value;
      }

      return Dom.tpl.Form.field(doc, name, fieldOptions, this);
    },

    deleteButton() {
      if (! this.deleteName) {
        return '';
      }

      const elm = $.element;
      if (elm.tagName === 'BUTTON') {
        return elm;
      } else {
        const elm = document.createElement('button');
        elm.setAttribute('type', 'button');
        elm.setAttribute('name', 'delete');
        elm.textContent = this.deleteName;
        return elm;
      }
    },

    applyName() {
      return this.applyName ?? 'Apply';
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
      return this.options.name + '-field';
    },
    value() {
      return this.doc[this.options.name];
    },
  });

  function submit(event) {
    Dom.stopEvent();

    const ctx = Dom.ctx(this);
    const widget = ctx[widget$];

    const input = this.firstChild;

    const {value} = input;

    widget._onSubmit?.(value, this);
  }

  const cancel = (elm) => {
    const ctx = Dom.ctx(elm);
    ctx.data?.doc?.$reload();
    ctx[widget$].close();
  };

  Tpl.$events({
    submit,

    'keydown'(event) {
      switch (event.which) {
      case 13:
        if (! event.shiftKey && (Dom.ctrlOrMeta(event) || $.ctx.data.enterSubmits)) {
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
      const ctx = Dom.ctx(this);
      const widget = ctx[widget$];

      Dialog.confirm({
        classes: 'warn cl',
        okay: 'Delete',
        content: ctx.data.deleteConfirmMsg ?? 'Are you sure you want to delete this?',
        callback(confirmed) {
          if (confirmed) {
            widget._onDelete?.();
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
    $created: (ctx, elm) => {ctx.data?.editTpl?.$opened?.(elm)},

    newWidget: (options) => new Widget(options),

    swapFor: (elm, options) => {
      const widget = new Widget(options);
      elm.parentNode.replaceChild(widget.element, elm);
      widget.swap = elm;

      widget.element.querySelector(Dom.INPUT_SELECTOR)?.focus();

      return widget;
    },

    autoRegister: (template, func) => {
      template.$events({
        'click .ui-editable'(event) {
          Dom.stopEvent();
          const range = Dom.getRange();
          if (range !== null && ! range.collapsed) return;
          const target = this;
          if (Dom.matches(target, '.readOnly *')) return;
          const ctx = Dom.ctx(target);
          ctx.options.value = (ctx.options.doc = ctx.data.doc)[ctx.options.name];
          const widget = Tpl.swapFor(target, ctx.options);
          widget.onSubmit(function (value, form) {
            const doc = ctx.data.doc;
            doc.$reload();
            doc[ctx.options.name] = value;
            if (func) {
              Dom.addClass(form, 'submitting');
              if (func.call(widget, doc, ctx.options.name, value, form) === 'exit') {
                return;
              }
            }
            Tpl.saveField(doc, form, this);
          });
        },
      });
      return this;
    },

    saveField: (doc, form, widget) => {
      if (doc[error$] === void 0) for (const _ in doc.changes) {
        doc.$save();
        break;
      }
      if (doc[error$] !== void 0) {
        Dom.removeClass(form, 'submitting');
        Dom.tpl.Form.renderErrors(doc, form);
      } else {
        widget?.close(form);
      }
    },
  });

  Dom.registerHelpers({
    editInPlace(options) {
      let elm = $.element;

      let ctx;
      if (elm.nodeType !== document.ELEMENT_NODE) {
        const pTpl = $.ctx.template;
        const tpl = pTpl[options.showTemplate ?? 'Show_' + options.name] ?? Tpl.GenericShow;
        elm = tpl.$render();
        ctx = Dom.ctx(elm);
        options.editTpl = pTpl[options.editTemplate ?? 'Edit_' + options.name];
        ctx.options = options;
      } else {
        ctx = Dom.ctx(elm);
      }

      ctx?.updateAllTags({doc: this, options});

      return elm;
    },
  });

  return Tpl;
});
