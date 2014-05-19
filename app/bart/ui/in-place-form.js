var Tpl = Bart.InPlaceForm;
var $ = Bart.current;

Tpl.$helpers({
  field: function () {
    var options = this;

    if (options.editTpl) return options.editTpl.$autoRender(options);

    var fieldOptions = {
      type: options.type,
    };

    for(var key in options) {
      var m = /^html-(.*)$/.exec(key);
      if (m)
        fieldOptions[m[1]] = options[key];
    }

    var name = options.name || 'name';
    var doc = options.doc;
    if (! doc) {
      doc = {};
      doc[name] = options.value;
    }

    return Bart.Form.field(doc, name, fieldOptions);
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
    return Apputil.capitalize(Apputil.humanize(this.options.name));
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

Tpl.$events({
  'submit': function (event) {
    Bart.stopEvent();

    var ctx = Bart.getCtx(this);
    var widget = ctx._widget;

    var input = this.firstChild;

    var value = input.value;

    widget._onSubmit && widget._onSubmit(value, this);
  },

  'keyup': function (event) {
    if (event.which === 27) {
      Bart.stopEvent();
      Bart.getCtx(this)._widget.close();
    }
  },

  'click [name=delete]': function (event) {
    Bart.stopEvent();
    var ctx = Bart.getCtx(this);
    var widget = ctx._widget;

    Bart.Dialog.confirm({
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
    Bart.stopEvent();
    var ctx = Bart.getCtx(this);
    var widget = ctx._widget;

    widget.close();
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

    var focus = widget.element.querySelector(Bart.INPUT_SELECTOR);
    focus && focus.focus();

    return widget;
  },

  autoRegister: function (template, func) {
    template.$events({
      'click .ui-editable': function (event) {
        Bart.stopEvent();
        var target = this;
        if (Bart.matches(target, '.readOnly *')) return;
        var ctx = Bart.getCtx(target);
        ctx.options.value = (ctx.options.doc = ctx.data.doc)[ctx.options.name];
        var widget = Tpl.swapFor(target, ctx.options);
        widget.onSubmit(function (value, form) {
          var doc = ctx.data.doc;
          doc.$reload();
          doc[ctx.options.name] = value;
          if (func) {
            Bart.addClass(form, 'submitting');
            if (func.call(widget, doc, ctx.options.name, value, form) === 'exit')
              return;
          }
          if (! doc._errors) for(var noop in doc.changes) {
            doc.$save();
            break;
          }
          if (doc._errors) {
            Bart.removeClass(form, 'submitting');
            Bart.Form.renderErrors(doc, form);
          } else {
            widget.close(form);
          }
        });
      },
    });
    return this;
  },
});

Bart.registerHelpers({
  editInPlace: function (options) {
    var elm = $.element;

    if (elm.nodeType !== document.ELEMENT_NODE) {
      var pTpl = $.ctx.template;
      var tpl = pTpl[options.showTemplate||'Show_'+options.name] || Tpl.GenericShow;
      elm = tpl.$render();
      var ctx = Bart.getCtx(elm);
      options.editTpl = pTpl[options.editTemplate||'Edit_'+options.name];
    } else {
      var ctx = Bart.getCtx(elm);
    }

    ctx.updateAllTags({doc: this, options: options});
    ctx.options = options;
    return elm;
  },
});

function Widget(options) {
  var element = this.element = Tpl.$autoRender(options);
  var ctx = this.ctx = Bart.getCtx(element);
  ctx._widget = this;
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
    Bart.remove(this.element);
  },
};
