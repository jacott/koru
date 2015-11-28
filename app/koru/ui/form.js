define(function(require, exports, module) {
  var Dom   = require('../dom');
  var koru   = require('../main');
  var Route = require('./route');
  var Val   = require('../model/validation');
  var util = require('../util');
  var MarkdownEditor = require('./markdown-editor');
  var format = require('../format');
  var PlainText = require('./plain-text');

  var Tpl = Dom.newTemplate(require('../html!./form'));
  var OnOff = Tpl.OnOff;
  var $ = Dom.current;

  var IGNORE = {type: true, data: true, label: true, includeBlank: true, selectList: true, value: true};

  var DEFAULT_HELPERS = {
    value: function () {
      return this.doc[this.name];
    },

    htmlOptions: function () {
      var elm = $.element;
      var options = this.options;

      for(var attr in options) {
        if (! (attr in IGNORE))
          elm.setAttribute(attr, options[attr]);
      }
    },
  };

  var modalize;

  /**
   * @deprecated
   */
  function modalizeCallback(event) {
    var elm = modalize.elm;
    if (typeof elm === 'string') modalize.elm = elm = document.querySelector(elm);
    if (Dom.getClosestClass(event.target, 'anyModal')) return;
    if (event.type === 'keyup') {
      if (event.which === 27) {
        if (! Dom.contains(elm, event.target))
          return modalize.func.call(this, event);

        switch (event.target.tagName) {
        case 'INPUT':
        case 'TEXTAREA':
          return;
        }
        if (event.target.getAttribute('contenteditable') === 'true') return;
        return modalize.func.call(this, event);
      }
    } else if (! Dom.contains(elm, event.target))
      return modalize.func.call(this, event);
  };

  Tpl.$extend({
    field: field,
    /**
     * @deprecated
     */
    modalize: function (elm, func) {
      if (modalize) {
        modalize = {parent: modalize, elm: elm, func: func};
      } else {
        modalize = {elm: elm, func: func};

        document.addEventListener('mousedown', modalizeCallback, true);
        document.addEventListener('keyup', modalizeCallback, true);
      }
    },

    /**
     * @deprecated
     */
    cancelModalize: function (all) {
      if (! modalize) return null;
      modalize = all === 'all' ? null : modalize.parent;
      if (! modalize) {
        document.removeEventListener('mousedown', modalizeCallback, true);
        document.removeEventListener('keyup', modalizeCallback, true);
        return null;
      }
      return modalize.elm;
    },

    updateInput: Dom.updateInput,

    submitFunc: function(elmId, successPage, extraSetup) {
      return function (event) {
        Dom.stopEvent();

        var elm = document.getElementById(elmId);
        var ctx = Dom.getCtx(elm);
        var doc = ctx.data;
        var form = elm.getElementsByClassName('fields')[0];

        if (! form) throw new Error('no "fields" class within ' + elmId);
        Tpl.fillDoc(doc, form);
        extraSetup && extraSetup(doc, elm);

        if (doc.$save()) {
          switch(typeof successPage) {
          case 'object':
            Route.replacePath(successPage);
            break;
          case 'function':
            successPage(doc);
            break;
          case 'string':
            if (successPage === 'back')
              Route.history.back();
            break;
          }
        } else {
          Tpl.renderErrors(doc, form);
        }
      };
    },

    disableFields: function (form) {
      Dom.forEach(form, Dom.WIDGET_SELECTOR, function (elm) {
        elm.setAttribute('disabled', 'disabled');
      });
    },

    enableFields: function (form) {
      Dom.forEach(form, Dom.WIDGET_SELECTOR, function (elm) {
        elm.removeAttribute('disabled');
      });
    },

    saveDoc: function (doc, form) {
      Tpl.fillDoc(doc, form);
      if (doc.$save()) {
        return true;
      }

      Tpl.renderErrors(doc, form);
    },

    saveChanges: function (doc, form, onChange) {
      Tpl.clearErrors(form);
      if (onChange) {
        var changes = doc.changes;
        var was = doc.$asChanges(changes);
      }
      if (doc.$save()) {

        onChange && onChange(doc, changes, was);
        return true;
      }

      Tpl.renderErrors(doc, form);
    },

    getRadioValue: function (elm, name) {
      var checked = elm.querySelector('[name="'+name+'"]:checked');
      if (checked) return checked.value;
    },

    fillDoc: function (doc, form) {
      var fields = form.querySelectorAll('[name]:not([type=radio])');
      for(var i = 0; i < fields.length; ++i) {
        var field = fields[i];
        doc[field.getAttribute('name')] = field.value;
      }

      var fields = form.getElementsByClassName('radioGroup');
      for(var i = 0; i < fields.length; ++i) {
        var field = fields[i];
        var name= field.getAttribute('data-errorField');

        doc[name] = Tpl.getRadioValue(field, name);
      }
    },

    clearErrors: function (form) {
      var msgs = form.getElementsByClassName('error');
      while(msgs.length) {
        Dom.removeClass(msgs[msgs.length - 1], 'error');
      }
    },

    renderErrors: function (doc, form) {
      var errors = doc._errors;
      var focus = null;
      var otherMsgs = [];
      Tpl.clearErrors(form);


      if (errors) {
        for(var field in errors) {

          var msg = Val.Error.msgFor(doc, field);
          if (msg) {
            var fieldElm = Tpl.renderError(form, field, msg);
            if (fieldElm)
              focus = focus || fieldElm;
            else
              otherMsgs && otherMsgs.push([field,msg]);
          }
        }
        if (otherMsgs.length > 0) {
          koru.unexpectedError && koru.unexpectedError('Save invalid', JSON.stringify(otherMsgs));
        }

        focus && focus.focus();
        return true;
      }

      return false;
    },

    renderError: function (form, field, msg) {
      var fieldElm = form.querySelector('[name="'+field+'"],[data-errorField="'+field+'"]');

      if (! fieldElm) return;

      var msgElm = fieldElm.nextElementSibling;
      if (! (msgElm && Dom.hasClass(msgElm, 'errorMsg'))) {
        msgElm = document.createElement('error');
        Dom.addClass(msgElm, 'errorMsg');
        msgElm.appendChild(document.createElement('div'));
        fieldElm.parentNode.insertBefore(msgElm, fieldElm.nextElementSibling);
        var ms = msgElm.style;
      } else {
        var ms = msgElm.style;
        ms.marginTop = ms.marginLeft = ms.height = ms.width = '';
      }
      Dom.setClass('error', msg, fieldElm);
      Dom.removeClass(msgElm, 'animate');
      msgElm.firstChild.textContent = msg || '';
      if (msg && Dom.hasClass(fieldElm, 'errorTop')) {
        var fpos = fieldElm.getBoundingClientRect();
        ms.height = fpos.height+'px';
        ms.position = 'absolute';
        var mpos = msgElm.getBoundingClientRect();
        ms.marginTop = (fpos.top-mpos.top-mpos.height)+'px';

        if (Dom.hasClass(fieldElm, 'errorRight') )
          ms.marginLeft = (fpos.right-mpos.right)+'px';
        else
          ms.marginLeft = (fpos.left-mpos.left)+'px';
        }
      Dom.setClass('animate', msg, msgElm);

      return fieldElm;
    },

    addChangeFields: function (options) {
      var action = options.action || 'change';
      var events = {};
      for(var i=0;i < options.fields.length;++i) {
        var field = options.fields[i];
        if (action === 'change' && /color/i.test(field) && ! /enable/i.test(field)) {
          events['click [name=' + field + ']'] = changeColorEvent(field, options);
        } else {
          events[action + ' [name=' + field + ']'] = changeFieldEvent(field, options);
        }
      }
      options.template.$events(events);
    },

    renderField: field,
  });

  helpers('TextInput', {});
  helpers('Select', {});
  helpers('Radio', {});

  Tpl.Select.$extend({
    $created: function (ctx, elm) {
      buildSelectList(ctx, elm, function (value, content, selected) {
        var option = document.createElement('option');
        option.value = value;
        option.textContent = content;
        if (selected)
          option.setAttribute('selected', 'selected');
        return option;
      });
    },
  });

  Tpl.Radio.Button.$helpers({
    checked: function () {
      Dom.setBoolean('checked', this.checked);
    },
  });

  Tpl.Radio.$extend({
    $created: function (ctx, elm) {
      var Button = Tpl.Radio.Button;
      var name = ctx.data.name;
      buildSelectList(ctx, elm, function (value, content, checked) {
        return Button.$render({name: name, value: value, label: content, checked: checked});
      });
    },
  });


  function buildSelectList(ctx, elm, optionFunc) {
    var data = ctx.data;
    var value = data.doc[data.name];
    var options = data.options;
    var sl = options.selectList;
    if (! sl) throw new Error('invalid selectList for ' + data.name);
    if ('fetch' in sl)
      sl = sl.fetch();
    if (sl.length === 0) return;
    if (typeof sl[0] === 'string') {
      var getValue = function (row) {return row};
      var getContent = getValue;
    } else if ('_id' in sl[0]) {
      var getValue = function (row) {return row._id};
      var getContent = function (row) {return row.name};
    } else {
      var getValue = function (row) {return row[0]};
      var getContent = function (row) {return row[1]};
    }
    var includeBlank = options.includeBlank;
    if (('includeBlank' in options) && includeBlank !== 'false') {
      if (typeof includeBlank !== 'string' || includeBlank === 'true')
        includeBlank = '';
      elm.appendChild(optionFunc('', includeBlank));
    }
    util.forEach(sl, function (row) {
      var rowValue = getValue(row);
      elm.appendChild(optionFunc(rowValue, getContent(row), rowValue == value));
    });
  }

  var errorMsg = document.createElement('span');
  errorMsg.className = 'errorMsg';

  Dom.registerHelpers({
    format: function () {
      return format.apply(this, arguments);
    },

    errorMsg: function () {
      var elm = Dom.current.element;
      return Dom.hasClass(elm, 'errorMsg') ? elm : errorMsg.cloneNode(true);
    },

    checked: function (value, onClass) {
      if ($.element.tagName === 'BUTTON')
        Dom.setClass(onClass||'on', value);
      else
        Dom.setBoolean('checked', value);
    },

    elmId: function (prefix) {
      return (prefix || this.constructor.modelName) + '_' + this._id;
    },

    field: function (name, options) {
      var data = (options && options.hasOwnProperty('data')) ? options.data : this;
      return field(data, name, options);
    },

    labelField: function (name, options) {
      options = options || {};
      var data = options.hasOwnProperty('data') ? options.data : this;
      return Tpl.LabelField.$autoRender({
        name: name,
        options: options,
        value: field(data, name, options),
        label: options.label ||  util.capitalize(util.humanize(name)),
      });
    },

    displayField: function (name, options) {
      options = options || {};
      var data = options.hasOwnProperty('data') ? options.data : this;

      var value = document.createElement('span');
      value.className = 'value';
      value.textContent = data[name];

      return Tpl.LabelField.$autoRender({
        name: name,
        value: value,
        options: options,
        label: options.label ||  util.capitalize(util.humanize(name)),
      });
    },

    genderList: function () {
      return [['', ''], ["m", "Male"], ["f", "Female"]];
    },
  });

  Tpl.Button.$helpers({
    type: function () {
      return this.type || 'button';
    },
  });

  OnOff.$helpers({
    classes: function () {
      var on = this.doc[this.name];
      if (this.options && this.options.hasOwnProperty('on')) on = on === this.options.on;
      return on ? 'on onOff' : 'onOff';
    },

    on: function () {
      return this.options.onLabel || 'On';
    },

    off: function () {
      return this.options.offLabel || 'Off';
    },
  });

  OnOff.$events({
    'click': function (event) {
      var data = $.ctx.data;
      Dom.toggleClass(this, 'on');
      var on = Dom.hasClass(this, 'on');
      if (data.options && data.options.hasOwnProperty('on')) {
        on = on ? data.options.on : data.options.off;
      }
      data.doc[data.name] = on;
    },
  });

  function helpers(name, funcs) {
    Tpl[name].$helpers(util.reverseExtend(funcs, DEFAULT_HELPERS));
  }

  function field(doc, name, options) {
    options = options || {};
    if ('selectList' in options) {
      return Tpl[options.type === 'radio' ? 'Radio' : 'Select'].$autoRender({name: name, doc: doc, options: options});
    }

    switch(options.type || 'text') {
    case 'plainTextEditor':
      return PlainText.Editor.$autoRender({content: doc[name], options: util.reverseExtend({"data-errorField": name}, options)});
    case 'markdownEditor':
      return MarkdownEditor.$autoRender({content: doc[name], options: util.reverseExtend({"data-errorField": name}, options)});
    case 'onOff':
      return OnOff.$autoRender({name: name, doc: doc, options: options});
    default:
      return Tpl.TextInput.$autoRender({type: options.type || 'text', name: name, doc: doc, options: options});
    }

  }

  function changeColorEvent(field, options) {
    return function (event) {
      Dom.stopEvent();
      var doc = $.data();

      var fieldSpec = doc.classMethods.$fields[field];
      var alpha = (fieldSpec && fieldSpec.color === 'alpha');

      Dom.ColorPicker.choose(doc[field], alpha, function (result) {
        if (result) {
          saveChange(doc, field, result, options);
        }
      });
    };
  }

  function changeFieldEvent(field, options) {
    return function (event) {
      Dom.stopEvent();
      var doc = $.data();

      var value;
      switch (this.type) {
      case 'checkbox':
        value = this.checked;
        break;
      default:
        value = this.value;
      }

      saveChange(doc, field, value, options);
    };
  }

  function saveChange(doc, field, value, options) {
    var form = document.getElementById(options.template.name);
    Tpl.clearErrors(form);
    if (options.update) {
      var errors = doc[options.update](field, value, options.undo);
      if (errors) {
        Tpl.renderErrors({_errors: errors}, form);
      }
    } else {
      doc[field] = value;
      Tpl.saveChanges(doc, form, options.undo);
    }
  }

  return Tpl;
});
