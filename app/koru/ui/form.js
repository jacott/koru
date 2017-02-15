define(function(require, exports, module) {
  const SelectMenu            = require('koru/ui/select-menu');
  const Dom                   = require('../dom');
  const format                = require('../format');
  const koru                  = require('../main');
  const Val                   = require('../model/validation');
  const util                  = require('../util');
  const PlainText             = require('./plain-text');
  const RichTextEditorToolbar = require('./rich-text-editor-toolbar');
  const Route                 = require('./route');

  const Tpl = Dom.newTemplate(require('../html!./form'));
  const $ = Dom.current;
  const OnOff = Tpl.OnOff;

  const IGNORE = {
    type: true, data: true, label: true,
    includeBlank: true, selectList: true, value: true,
    displayValue: true, popupClass: true,
  };

  const DEFAULT_HELPERS = {
    value() {
      return this.doc[this.name];
    },

    htmlOptions() {
      const elm = $.element;
      const options = this.options;

      for(let attr in options) {
        if (! (attr in IGNORE))
          elm.setAttribute(attr, options[attr]);
      }
    },
  };

  const EDITORS = {
    richTextEditor: RichTextEditorToolbar,
    plainTextEditor: PlainText.Editor,
  };


  let modalize;

  /**
   * @deprecated
   */
  function modalizeCallback(event) {
    let elm = modalize.elm;
    if (typeof elm === 'string') modalize.elm = elm = document.querySelector(elm);
    if (Dom.getClosestClass(event.target, 'anyModal')) return;
    if (event.type === 'keydown') {
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
    field,
    /**
     * @deprecated
     */
    modalize(elm, func) {
      if (modalize) {
        modalize = {parent: modalize, elm, func};
      } else {
        modalize = {elm, func};

        document.addEventListener('pointerdown', modalizeCallback, true);
        document.addEventListener('keydown', modalizeCallback);
      }
    },

    /**
     * @deprecated
     */
    cancelModalize(all) {
      if (! modalize) return null;
      modalize = all === 'all' ? null : modalize.parent;
      if (! modalize) {
        document.removeEventListener('pointerdown', modalizeCallback, true);
        document.removeEventListener('keydown', modalizeCallback);
        return null;
      }
      return modalize.elm;
    },

    updateInput: Dom.updateInput,

    submitFunc: function(elmId, options) {
      return function (event) {
        Dom.stopEvent();

        const elm = document.getElementById(elmId);
        const ctx = Dom.ctx(elm);
        const doc = ctx.data;
        const form = elm.getElementsByClassName('fields')[0];

        if (! form) throw new Error('no "fields" class within ' + elmId);
        Tpl.fillDoc(doc, form);

        if (options.success === undefined && options.save === undefined)
          options = {success: options};

        if (options.save)
          var result = options.save(doc, form, elm);
        else
          var result = doc.$save();

        const successPage = options.success;

        if (result) {
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

    disableFields(form) {
      Dom.forEach(form, Dom.WIDGET_SELECTOR, elm => {
        elm.setAttribute('disabled', 'disabled');
      });
    },

    enableFields(form) {
      Dom.forEach(form, Dom.WIDGET_SELECTOR, elm => {
        elm.removeAttribute('disabled');
      });
    },

    saveDoc(doc, form) {
      Tpl.fillDoc(doc, form);
      if (doc.$save()) {
        return true;
      }

      Tpl.renderErrors(doc, form);
    },

    saveChanges(doc, form, onChange) {
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

    getRadioValue(elm, name) {
      const checked = elm.querySelector('[name="'+name+'"]:checked');
      if (checked) return checked.value;
    },

    fillDoc(doc, form) {
      const modelFields = doc.constructor.$fields;
      let fields = form.querySelectorAll('[name]:not([type=radio]):not(button)');
      for(let i = 0; i < fields.length; ++i) {
        const fieldElm = fields[i];
        const name = fieldElm.getAttribute('name');
        if (modelFields[name])
          doc[name] = fieldElm.value;
      }

      fields = form.getElementsByClassName('radioGroup');
      for(let i = 0; i < fields.length; ++i) {
        const fieldElm = fields[i];
        const name= field.getAttribute('data-errorField');

        if (modelFields[name])
          doc[name] = Tpl.getRadioValue(fieldElm, name);
      }
    },

    clearErrors(form) {
      const msgs = form.getElementsByClassName('error');
      while(msgs.length) {
        Dom.removeClass(msgs[msgs.length - 1], 'error');
      }
    },

    renderErrors(doc, form) {
      const errors = doc._errors;
      const otherMsgs = [];
      let focus = null;
      Tpl.clearErrors(form);


      if (errors) {
        for(let field in errors) {

          const msg = Val.Error.msgFor(doc, field);
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

    renderError(form, field, msg) {
      if (arguments.length === 2) {
        var fieldElm = form;
        msg = field;
      } else {
        var fieldElm = form.querySelector('[name="'+field+'"],[data-errorField="'+field+'"]');
      }

      if (Array.isArray(msg))
        msg = Val.text(msg);

      if (! fieldElm) return;

      let msgElm = fieldElm.nextElementSibling;
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
        const fpos = fieldElm.getBoundingClientRect();
        ms.position = 'absolute';
        const mpos = msgElm.getBoundingClientRect();
        ms.marginTop = (fpos.top-mpos.top-mpos.height)+'px';

        if (Dom.hasClass(fieldElm, 'errorRight') )
          ms.marginLeft = (fpos.right-mpos.right)+'px';
        else
          ms.marginLeft = (fpos.left-mpos.left)+'px';
        }
      Dom.setClass('animate', msg, msgElm);

      return fieldElm;
    },

    addChangeFields(options) {
      const action = options.action || 'change';
      const events = {};
      for(let i= 0; i < options.fields.length; ++i) {
        const field = options.fields[i];
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
  helpers('Radio', {});

  helpers('SelectMenu', {
    buttonText() {
      const button = $.element;
      const options = this.options;
      let found = false;
      let result;

      Dom.addClass(button, 'select');
      if ('displayValue' in options) {
        if (options.displayValue) {
          result = options.displayValue;
          found = true;
        }

      } else {
        const value = this.doc[this.name];
        for (let row  of this.selectList()) {
          const id = row[0] != null ? row[0] :
                  row.id != null ? row.id : row._id;
          if (id == value) {
            result = row[1] || row.name;
            found = true;
            break;
          }
        }
      }

      if (! found) {
        const includeBlank = options.includeBlank;
        if (typeof includeBlank === 'string')
          result = includeBlank;
      }

      Dom.setClass('noValue', ! found);
      Dom.removeChildren(button);
      if (result && result.cloneNode) {
        button.appendChild(result.cloneNode(true));
      } else
        button.textContent = result || '';
    },
  });

  Tpl.SelectMenu.$extend({
    $created(ctx, elm) {
      const data = ctx.data;
      const list = data.options.selectList;

      switch (typeof list) {
      case 'function':
        data.selectList = includeBlank => selectMenuList(list(), includeBlank);
        break;
      case 'string':
        switch (list) {
        case 'inclusionIn':
          data.selectList = includeBlank => selectMenuList(
            data.doc.constructor.$fields[data.name].inclusion.in
              .map(v => [v, v]),
            includeBlank
          );
          break;
        default:
          throw new Error(`Invalid value for selectList: ${list}`);
        }
        break;
      default:
        data.selectList = includeBlank => selectMenuList(list, includeBlank);
        break;
      }
    },
  });

  function selectMenuList(list, includeBlank) {
    return includeBlank ? [
      ['', Dom.h({i:typeof includeBlank === 'string' ? includeBlank : '', class: 'blank'})],
      ...list
    ] : list;
  }

  Tpl.SelectMenu.$events({
    'pointerdown'(event) {
      Dom.stopEvent();

      const data = $.ctx.data;
      const options = data.options;
      const button = event.currentTarget.firstChild;
      const hidden = event.currentTarget.lastChild;

      SelectMenu.popup(button, {
        list: data.selectList(options.includeBlank),
        selected: hidden.value,
        classes: options.popupClass,
        onSelect(elm) {
          const data = $.data(elm);
          button.textContent = data.name && data.name.nodeType ? data.name.textContent : data.name;
          const id = data._id || data.id;
          hidden.value = id;
          Dom.setClass('noValue', ! id, button);
          Dom.triggerEvent(hidden, 'change');

          return true;
        },
      });
    },
  });


  helpers('Select', {});
  Tpl.Select.$extend({
    $created(ctx, elm) {
      buildSelectList(ctx, elm, (value, content, selected) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = content;
        if (selected)
          option.setAttribute('selected', 'selected');
        return option;
      });
    },
  });

  Tpl.Radio.Button.$helpers({
    checked() {
      Dom.setBoolean('checked', this.checked);
    },
  });

  Tpl.Radio.$extend({
    $created(ctx, elm) {
      const Button = Tpl.Radio.Button;
      const name = ctx.data.name;
      buildSelectList(ctx, elm, (value, content, checked) => {
        return Button.$render({name: name, value: value, label: content, checked: checked});
      });
    },
  });

  Tpl.LabelField.$extend({
    $created(ctx, elm) {
      Dom.addClass(elm, 'label_'+ctx.data.name);
    },
  });


  function buildSelectList(ctx, elm, optionFunc) {
    const data = ctx.data;
    const value = data.doc[data.name];
    const options = data.options;
    let sl = options.selectList;
    if (! sl) throw new Error('invalid selectList for ' + data.name);
    if ('fetch' in sl)
      sl = sl.fetch();
    if (sl.length === 0) return;
    if (typeof sl[0] === 'string') {
      var getValue = row => row;
      var getContent = getValue;
    } else if ('_id' in sl[0]) {
      var getValue = row => row._id;
      var getContent = row => row.name;
    } else {
      var getValue = row => row[0];
      var getContent = row => row[1];
    }
    let includeBlank = options.includeBlank;
    if (('includeBlank' in options) && includeBlank !== 'false') {
      if (typeof includeBlank !== 'string' || includeBlank === 'true')
        includeBlank = '';
      elm.appendChild(optionFunc('', includeBlank));
    }
    util.forEach(sl, row => {
      const rowValue = getValue(row);
      elm.appendChild(optionFunc(rowValue, getContent(row), rowValue == value));
    });
  }

  const errorMsg = document.createElement('span');
  errorMsg.className = 'errorMsg';

  Dom.registerHelpers({
    format,

    errorMsg() {
      const elm = Dom.current.element;
      return Dom.hasClass(elm, 'errorMsg') ? elm : errorMsg.cloneNode(true);
    },

    checked(value, onClass) {
      if ($.element.tagName === 'BUTTON')
        Dom.setClass(onClass||'on', value);
      else
        Dom.setBoolean('checked', value);
    },

    elmId(prefix) {
      return (prefix || this.constructor.modelName) + '_' + this._id;
    },

    field(name, options) {
      const data = (options && options.hasOwnProperty('data')) ? options.data : this;
      return field(data, name, options);
    },

    labelField(name, options, arg3) {
      if (arg3) {
        var extend = options;
        options = arg3;
      }

      options = options || {};
      const data = options.hasOwnProperty('data') ? options.data : this;
      return Tpl.LabelField.$autoRender({
        name,
        options,
        value: field(data, name, options, extend),
        label: options.label ||  util.capitalize(util.humanize(name)),
      });
    },

    displayField(name, options={}) {
      const data = options.hasOwnProperty('data') ? options.data : this;

      const value = document.createElement('span');
      value.className = 'value';
      const content = data[name];
      if (content)
        value.textContent = typeof content === 'object' ?
        content.displayName || content.name || content : content;

      return Tpl.LabelField.$autoRender({
        name,
        value,
        options,
        label: options.label ||  util.capitalize(util.humanize(name)),
      });
    },

    genderList() {
      return [['', Dom.h({i: '', class: 'blank'})], ["f", "Female"], ["m", "Male"]];
    },
  });

  Tpl.Button.$helpers({
    type() {
      return this.type || 'button';
    },
  });

  OnOff.$helpers({
    classes() {
      let on = this.doc[this.name];
      if (this.options && this.options.hasOwnProperty('on')) on = on === this.options.on;
      return on ? 'on onOff' : 'onOff';
    },

    on() {
      return this.options.onLabel || 'On';
    },

    off() {
      return this.options.offLabel || 'Off';
    },
  });

  OnOff.$events({
    'click'(event) {
      const data = $.ctx.data;
      Dom.toggleClass(this, 'on');
      let on = Dom.hasClass(this, 'on');
      if (data.options && data.options.hasOwnProperty('on')) {
        on = on ? data.options.on : data.options.off;
      }
      data.doc[data.name] = on;
    },
  });

  function helpers(name, funcs) {
    Tpl[name].$helpers(util.reverseMerge(funcs, DEFAULT_HELPERS));
  }

  function field(doc, name, options, extend) {
    options = options || {};
    const data = {name, doc, options};
    if ('selectList' in options) {
      return ((options.type && Tpl[util.capitalize(options.type)]) || Tpl.Select).$autoRender(data);
    }

    switch(options.type || 'text') {
    case 'onOff':
      return OnOff.$autoRender(data);
    default:
      const editor = EDITORS[options.type];
      if (editor) {
        if (extend) data.extend = extend;
        data.content = doc[name];
        data.options = util.merge({"data-errorField": name}, options);
        return editor.$autoRender(data);
      }

      data.type = options.type || 'text';
      return Tpl.TextInput.$autoRender(data);
    }

  }

  function changeColorEvent(field, options) {
    return function (event) {
      Dom.stopEvent();
      const doc = $.data();

      const fieldSpec = doc.classMethods.$fields[field];
      const alpha = (fieldSpec && fieldSpec.color === 'alpha');

      Dom.ColorPicker.choose(doc[field], alpha, result => {
        if (result) {
          saveChange(doc, field, result, options);
        }
      });
    };
  }

  function changeFieldEvent(field, options) {
    return function (event) {
      Dom.stopEvent();
      const doc = $.data();

      let value;
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
    const form = document.getElementById(options.template.name);
    Tpl.clearErrors(form);
    let errors;
    switch (typeof options.update) {
    case 'string':
      errors = doc[options.update](field, value, options.undo);
      break;
    case 'function':
      errors = options.update(doc, field, value, options.undo);

      break;
    default:
      doc[field] = value;
      Tpl.saveChanges(doc, form, options.undo);
      return;
    }
    errors && Tpl.renderErrors({_errors: errors}, form);
  }

  return Tpl;
});
