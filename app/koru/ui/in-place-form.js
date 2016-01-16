define(function(require, exports, module) {
  var Dom = require('../dom');
  var Form = require('./form');
  var util = require('../util');
  var Dialog = require('./dialog');

  var Tpl = Dom.newTemplate(require('../html!./in-place-form'));
  var $ = Dom.current;

  Tpl.$helpers({
    htmlAttrs: function () {
      var options = this;
      var elm = $.element;

      for(var key in options) {
        var m = /^html-form-(.*)$/.exec(key);
        if (m)
          elm.setAttribute(m[1], options[key]);
      }
    },

    field: function () {
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

    deleteButton: function () {
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

    applyName: function () {
      return this.applyName || 'Apply';
    },
  });

  Tpl.GenericShow.$helpers({
    label: function () {
      return util.capitalize(util.humanize(this.options.name));
    },
    name: function () {
      return this.options.name;
    },

    classes: function () {
      return this.options.name+"-field";
    },
    value: function () {
      return this.doc[this.options.name];
    },
  });

  function submit(event) {
    Dom.stopEvent();

    var ctx = Dom.getCtx(this);
    var widget = ctx._widget;

    var input = this.firstChild;

    var value = input.value;

    widget._onSubmit && widget._onSubmit(value, this);
  }

  Tpl.$events({
    'submit': submit,

    'keydown': function (event) {
      switch (event.which) {
      case 13:
        if (event.ctrlKey || event.shiftKey || $.ctx.data.enterSubmits) {
          Dom.stopEvent();
          submit.call(this, event);
        }
        break;
      }
    },

    'keyup': function (event) {
      switch (event.which) {
      case 27:
        Dom.stopEvent();
        cancel(this);
        break;
      }
    },

    'click [name=delete]': function (event) {
      Dom.stopEvent();
      var ctx = Dom.getCtx(this);
      var widget = ctx._widget;

      Dialog.confirm({
        classes: 'warn cl',
        okay: 'Delete',
        content: ctx.data.deleteConfirmMsg || 'Are you sure you want to delete this?',
        callback: function (confirmed) {
          if (confirmed) {
            widget._onDelete && widget._onDelete();
          }
        },
      });
    },

    'click [name=cancel]': function (event) {
      Dom.stopEvent();
      cancel(this);
    },
  });


  Tpl.$extend({
    $created: function (ctx, elm) {
      var editTpl = ctx.data && ctx.data.editTpl;
      if (editTpl && '$opened' in editTpl) {
        editTpl.$opened(elm);
      }
    },
    newWidget: function (options) {
      return new Widget(options);
    },

    swapFor: function (elm, options) {
      var widget = new Widget(options);
      elm.parentNode.replaceChild(widget.element, elm);
      widget.swap = elm;

      var focus = widget.element.querySelector(Dom.INPUT_SELECTOR);
      focus && focus.focus();

      return widget;
    },

    autoRegister: function (template, func) {
      template.$events({
        'click .ui-editable': function (event) {
          Dom.stopEvent();
          var target = this;
          if (Dom.matches(target, '.readOnly *')) return;
          var ctx = Dom.getCtx(target);
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
            if (! doc._errors) for(var noop in doc.changes) {
              doc.$save();
              break;
            }
            if (doc._errors) {
              Dom.removeClass(form, 'submitting');
              Dom.Form.renderErrors(doc, form);
            } else {
              widget.close(form);
            }
          });
        },
      });
      return this;
    },
  });

  Dom.registerHelpers({
    editInPlace: function (options) {
      var elm = $.element;

      if (elm.nodeType !== document.ELEMENT_NODE) {
        var pTpl = $.ctx.template;
        var tpl = pTpl[options.showTemplate||'Show_'+options.name] || Tpl.GenericShow;
        elm = tpl.$render();
        var ctx = Dom.getCtx(elm);
        options.editTpl = pTpl[options.editTemplate||'Edit_'+options.name];
        ctx.options = options;
      } else {
        var ctx = Dom.getCtx(elm);
      }

      ctx.updateAllTags({doc: this, options: options});

      return elm;
    },
  });

  function Widget(options) {
    var element = this.element = Tpl.$autoRender(options);
    var ctx = this.ctx = Dom.getCtx(element);
    ctx._widget = this;
  }

  function cancel(elm) {
    var ctx = Dom.getCtx(elm);
    var data = ctx.data;
    data && data.doc && data.doc.$reload();
    ctx._widget.close();
  }

  Widget.prototype = {
    constructor: Widget,

    onSubmit: function (func) {
      this._onSubmit = func;
    },

    onDelete: function (func) {
      this._onDelete = func;
    },

    close: function () {
      if (this.swap) {
        this.element.parentNode.replaceChild(this.swap, this.element);
        this.swap = null;
      }
      Dom.remove(this.element);
    },
  };

  return Tpl;
});
