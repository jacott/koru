define((require) => {
  'use strict';
  const SelectMenu      = require('koru/ui/select-menu');
  const PlainText       = require('./plain-text');
  const RichTextEditorToolbar = require('./rich-text-editor-toolbar');
  const Route           = require('./route');
  const Dom             = require('../dom');
  const format          = require('../format');
  const koru            = require('../main');
  const Val             = require('../model/validation');
  const util            = require('../util');

  const {error$} = require('koru/symbols');

  const {hasOwn} = util;

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

      for (let attr in options) {
        if (! (attr in IGNORE)) {
          elm.setAttribute(attr, options[attr]);
        }
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
    if (Dom.getClosest(event.target, '.anyModal')) return;
    if (event.type === 'keydown') {
      if (event.which === 27) {
        if (Dom.contains(elm, event.target) === null) {
          return modalize.func.call(this, event);
        }

        switch (event.target.tagName) {
        case 'INPUT':
        case 'TEXTAREA':
          return;
        }
        if (event.target.getAttribute('contenteditable') === 'true') return;
        return modalize.func.call(this, event);
      }
    } else if (! Dom.contains(elm, event.target)) {
      return modalize.func.call(this, event);
    }
  }

  const helpers = (name, funcs) => {
    Tpl[name].$helpers(util.reverseMerge(funcs, DEFAULT_HELPERS));
  };

  const field = (doc, name, options={}, extend) => {
    const data = {name, doc, options};
    if ('selectList' in options) {
      return ((options.type && Tpl[util.capitalize(options.type)]) ?? Tpl.Select).$autoRender(data);
    }

    switch (options.type ?? 'text') {
    case 'onOff':
      return OnOff.$autoRender(data);
    default:
      const editor = EDITORS[options.type];
      if (editor) {
        if (extend) data.extend = extend;
        data.content = doc[name];
        data.options = Object.assign({'data-errorField': name}, options);
        return editor.$autoRender(data);
      }

      data.type = options.type ?? 'text';
      return Tpl.TextInput.$autoRender(data);
    }
  };

  const changeColorEvent = (field, options) => function (event) {
    Dom.stopEvent();
    const doc = $.data();

    const fieldSpec = doc.classMethods.$fields[field];
    const alpha = fieldSpec ? fieldSpec.color === 'alpha' : false;

    Dom.tpl.ColorPicker.choose({color: doc[field], alpha, anchor: this, callback: (result) => {
      if (result) {
        saveChange(doc, field, result, options);
      }
    }});
  }

  const changeFieldEvent = (field, options) => function (event) {
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
  }

  const saveChange = (doc, field, value, options) => {
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
    errors === undefined || Tpl.renderErrors({[error$]: errors}, form);
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

    submitFunc: (elmId, options) => (event) => {
      Dom.stopEvent();

      const elm = document.getElementById(elmId);
      const ctx = Dom.ctx(elm);
      const doc = ctx.data;
      const form = elm.getElementsByClassName('fields')[0];

      if (! form) throw new Error('no "fields" class within ' + elmId);
      Tpl.fillDoc(doc, form);

      if (options.success === undefined && options.save === undefined) {
        options = {success: options};
      }

      const result = options.save
            ? options.save(doc, form, elm)
            : doc.$save();

      const successPage = options.success;

      if (result) {
        switch (typeof successPage) {
        case 'object':
          Route.replacePath(successPage);
          break;
        case 'function':
          successPage(doc);
          break;
        case 'string':
          if (successPage === 'back') {
            Route.history.back();
          }
          break;
        }
      } else {
        Tpl.renderErrors(doc, form);
      }
    },

    disableFields(form) {
      Dom.forEach(form, Dom.WIDGET_SELECTOR, (elm) => {
        elm.setAttribute('disabled', 'disabled');
      });
    },

    enableFields(form) {
      Dom.forEach(form, Dom.WIDGET_SELECTOR, (elm) => {
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
      let changes, undo;
      if (onChange) {
        changes = doc.changes;
        undo = doc.$invertChanges(changes);
      }
      if (doc.$save()) {
        onChange?.(doc, changes, undo);
        return true;
      }

      Tpl.renderErrors(doc, form);
    },

    getRadioValue(elm, name) {
      const checked = elm.querySelector('[name="' + name + '"]:checked');
      if (checked) return checked.value;
    },

    fillDoc(doc, form) {
      const modelFields = doc.constructor.$fields;
      let fields = form.querySelectorAll('[name]:not([type=radio]):not(button)');
      for (let i = 0; i < fields.length; ++i) {
        const fieldElm = fields[i];
        const name = fieldElm.getAttribute('name');
        if ((modelFields === undefined || modelFields[name] !== undefined)) {
          doc[name] = fieldElm.value || undefined;
        }
      }

      fields = form.getElementsByClassName('radioGroup');
      for (let i = 0; i < fields.length; ++i) {
        const fieldElm = fields[i];
        const name = field.getAttribute('data-errorField');

        if ((modelFields === undefined || modelFields[name] !== undefined)) {
          doc[name] = Tpl.getRadioValue(fieldElm, name);
        }
      }

      return doc;
    },

    clearErrors(form) {
      const msgs = form.getElementsByClassName('error');
      while (msgs.length) {
        Dom.removeClass(msgs[msgs.length - 1], 'error');
      }
    },

    renderErrors(doc, form) {
      const errors = doc[error$] ?? (doc instanceof koru.Error ? doc.reason : undefined);
      const otherMsgs = [];
      let focus;
      Tpl.clearErrors(form);

      if (errors !== undefined) {
        for (const field in errors) {
          const msg = Val.Error.msgFor(errors, field);
          if (msg) {
            const fieldElm = Tpl.renderError(form, field, msg);
            if (fieldElm) {
              focus ??= fieldElm;
            } else {
              otherMsgs?.push([field, msg]);
            }
          }
        }
        if (otherMsgs.length > 0 && koru.unexpectedError !== undefined) {
          koru.unexpectedError('Save invalid', JSON.stringify(otherMsgs));
        }

        focus?.focus();
        return true;
      }

      return false;
    },

    renderError(form, field, msg) {
      let fieldElm;
      if (arguments.length === 2) {
        fieldElm = form;
        msg = field;
      } else {
        fieldElm = form.querySelector('[name="' + field + '"],[data-errorField="' + field + '"]');
      }

      msg = format.translate(msg);

      if (! fieldElm) return;

      let msgElm = fieldElm.nextElementSibling, ms;
      if (msgElm?.classList.contains('errorMsg')) {
        ms = msgElm.style;
        ms.removeProperty('margin-top'); ms.removeProperty('margin-left');
        ms.removeProperty('height'); ms.removeProperty('width');
      } else {
        msgElm = document.createElement('error');
        Dom.addClass(msgElm, 'errorMsg');
        msgElm.appendChild(document.createElement('div'));
        fieldElm.parentNode.insertBefore(msgElm, fieldElm.nextElementSibling);
        ms = msgElm.style;
      }
      Dom.setClass('error', msg, fieldElm);
      Dom.removeClass(msgElm, 'animate');
      msgElm.firstChild.textContent = msg || '';
      if (msg && Dom.hasClass(fieldElm, 'errorTop')) {
        const fpos = fieldElm.getBoundingClientRect();
        ms.setProperty('position', 'absolute');
        const mpos = msgElm.getBoundingClientRect();
        ms.setProperty('margin-top', (fpos.top - mpos.top - mpos.height) + 'px');

        ms.setProperty('margin-left', (
          Dom.hasClass(fieldElm, 'errorRight')
            ? fpos.right - mpos.right
            : fpos.left - mpos.left) + 'px');
      }
      Dom.setClass('animate', msg, msgElm);

      return fieldElm;
    },

    addChangeFields(options) {
      const action = options.action ?? 'change';
      const events = {};
      for (let i = 0; i < options.fields.length; ++i) {
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
        for (const row of this.selectList()) {
          const id = row[0] != null ? row[0] : row._id;
          if (id == value) {
            result = row[1] ?? row.name;
            found = true;
            break;
          }
        }
      }

      if (! found) {
        const includeBlank = options.includeBlank;
        if (typeof includeBlank === 'string') {
          result = includeBlank;
        }
      }

      Dom.setClass('noValue', ! found);
      Dom.removeChildren(button);
      if (result?.cloneNode !== undefined) {
        button.appendChild(result.cloneNode(true));
      } else {
        button.textContent = result ?? '';
      }
    },
  });

  const selectMenuList = (list, includeBlank) => includeBlank
        ? [
          ['', Dom.h({i: typeof includeBlank === 'string' ? includeBlank : '', class: 'blank'})],
          ...list,
        ]
        : list;

  Tpl.SelectMenu.$extend({
    $created(ctx, elm) {
      const data = ctx.data;
      const list = data.options.selectList;

      switch (typeof list) {
      case 'function':
        data.selectList = (includeBlank) => selectMenuList(list(), includeBlank);
        break;
      case 'string':
        switch (list) {
        case 'inclusionIn':
          data.selectList = (includeBlank) => selectMenuList(
            data.doc.constructor.$fields[data.name].inclusion.in
              .map((v) => [v, v]),
            includeBlank,
          );
          break;
        default:
          throw new Error(`Invalid value for selectList: ${list}`);
        }
        break;
      default:
        data.selectList = (includeBlank) => selectMenuList(list, includeBlank);
        break;
      }
    },
  });

  Tpl.SelectMenu.$events({
    'menustart'(event) {
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
          button.textContent = data.name?.nodeType ? data.name.textContent : data.name;
          const id = data._id;
          hidden.value = id;
          Dom.setClass('noValue', id == null, button);
          Dom.triggerEvent(hidden, 'change');

          return true;
        },
      });
    },
  });

  const buildSelectList = (ctx, elm, optionFunc) => {
    const data = ctx.data;
    const value = data.doc[data.name];
    const options = data.options;
    let sl = options.selectList;
    if (! sl) throw new Error('invalid selectList for ' + data.name);
    if ('fetch' in sl) {
      sl = sl.fetch();
    }
    if (sl.length === 0) return;
    let getValue, getContent;
    if (typeof sl[0] === 'string') {
      getValue = (row) => row;
      getContent = getValue;
    } else if ('_id' in sl[0]) {
      getValue = (row) => row._id;
      getContent = (row) => row.name;
    } else {
      getValue = (row) => row[0];
      getContent = (row) => row[1];
    }
    let includeBlank = options.includeBlank;
    if (('includeBlank' in options) && includeBlank !== 'false') {
      if (typeof includeBlank !== 'string' || includeBlank === 'true') {
        includeBlank = '';
      }
      elm.appendChild(optionFunc('', includeBlank));
    }
    util.forEach(sl, (row) => {
      const rowValue = getValue(row);
      elm.appendChild(optionFunc(rowValue, getContent(row), rowValue == value));
    });
  };

  Tpl.Select.$extend({
    $created(ctx, elm) {
      buildSelectList(ctx, elm, (value, content, selected) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = content;
        if (selected) {
          option.setAttribute('selected', 'selected');
        }
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
        return Button.$render({name, value, label: content, checked});
      });
    },
  });

  Tpl.LabelField.$extend({
    $created(ctx, elm) {
      Dom.addClass(elm, 'label_' + ctx.data.name);
    },
  });

  const errorMsg = document.createElement('span');
  errorMsg.className = 'errorMsg';

  Dom.registerHelpers({
    format,

    errorMsg() {
      const elm = Dom.current.element;
      return Dom.hasClass(elm, 'errorMsg') ? elm : errorMsg.cloneNode(true);
    },

    checked(value, onClass) {
      if ($.element.tagName === 'BUTTON') {
        Dom.setClass(onClass || 'on', value);
      } else {
        Dom.setBoolean('checked', value);
      }
    },

    elmId(prefix) {
      return (prefix ?? this.constructor.modelName) + '_' + this._id;
    },

    field(name, options) {
      const data = (options != null && hasOwn(options, 'data')) ? options.data : this;
      return field(data, name, options);
    },

    labelField(name, options, arg3) {
      let extend;
      if (arg3) {
        extend = options;
        options = arg3;
      }

      options ??= {};
      const data = hasOwn(options, 'data') ? options.data : this;
      return Tpl.LabelField.$autoRender({
        name,
        options,
        value: field(data, name, options, extend),
        label: options.label ?? util.capitalize(util.humanize(name)),
      });
    },

    displayField(name, options={}) {
      const data = hasOwn(options, 'data') ? options.data : this;

      const value = document.createElement('span');
      value.className = 'value';
      const content = data[name];
      if (content) {
        value.textContent = typeof content === 'object'
          ? content.displayName ?? content.name ?? content
          : content;
      }

      return Tpl.LabelField.$autoRender({
        name,
        value,
        options,
        label: options.label ?? util.capitalize(util.humanize(name)),
      });
    },

    genderList() {
      return [['f', 'Female'], ['m', 'Male'], ['n', 'Non binary']];
    },
  });

  Tpl.Button.$helpers({
    type() {
      return this.type ?? 'button';
    },
  });

  OnOff.$helpers({
    classes() {
      let on = this.doc[this.name];
      const {options} = this;
      if (options != null && hasOwn(options, 'on')) on = on === options.on;
      return on ? 'on onOff' : 'onOff';
    },

    on() {
      return this.options.onLabel ?? 'On';
    },

    off() {
      return this.options.offLabel ?? 'Off';
    },
  });

  OnOff.$events({
    'click'(event) {
      const data = $.ctx.data, {options} = data;
      Dom.toggleClass(this, 'on');
      let on = Dom.hasClass(this, 'on');
      if (options != null && hasOwn(options, 'on')) {
        on = on ? data.options.on : data.options.off;
      }
      data.doc[data.name] = on;
    },
  });

  return Tpl;
});
