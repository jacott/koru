_Test = {};

var $ = Bart.current;
var Tpl = Bart.Form;

var IGNORE = {type: true, label: true, includeBlank: true, selectList: true, value: true};

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

function modalizeCallback(event) {
  var elm = modalize.elm;
  if (typeof elm === 'string') modalize.elm = elm = document.querySelector(elm);
  if (Bart.getClosestClass(event.target, 'anyModal')) return;
  if (event.type === 'keyup') {
    if (event.which === 27) {
      if (! Bart.parentOf(elm, event.target))
        return modalize.func.call(this, event);

      switch (event.target.tagName) {
      case 'INPUT':
      case 'TEXTAREA':
        return;
      }
      if (event.target.getAttribute('contenteditable') === 'true') return;
      return modalize.func.call(this, event);
    }
  } else if (! Bart.parentOf(elm, event.target))
    return modalize.func.call(this, event);
};

Tpl.$extend({
  field: field,

  modalize: function (elm, func) {
    if (modalize) {
      modalize = {parent: modalize, elm: elm, func: func};
    } else {
      modalize = {elm: elm, func: func};

      document.addEventListener('mousedown', modalizeCallback, true);
      document.addEventListener('keyup', modalizeCallback, true);
    }
  },

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

  updateInput: function (input, value) {
    var start = input.selectionStart;
    var end = input.selectionEnd;
    if (value !== input.value) {
      input.value = value;
      input.setSelectionRange(start, end);
    }
    return value;
  },

  submitFunc: function(elmId, successPage, extraSetup) {
    return function (event) {
      Bart.stopEvent();

      var elm = document.getElementById(elmId);
      var ctx = Bart.getCtx(elm);
      var doc = ctx.data;
      var form = elm.getElementsByClassName('fields')[0];

      if (! form) throw new Error('no "fields" class within ' + elmId);
      Tpl.fillDoc(doc, form);
      extraSetup && extraSetup(doc, elm);

      if (doc.$save()) {
        switch(typeof successPage) {
        case 'object':
          AppRoute.replacePath(successPage);
          break;
        case 'function':
          successPage(doc);
          break;
        case 'string':
          if (successPage === 'back')
            AppRoute.history.back();
          break;
        }
      } else {
        Tpl.renderErrors(doc, form);
      }
    };
  },

  disableFields: function (form) {
    Bart.forEach(form, Bart.WIDGET_SELECTOR, function (elm) {
      elm.setAttribute('disabled', 'disabled');
    });
  },

  enableFields: function (form) {
    Bart.forEach(form, Bart.WIDGET_SELECTOR, function (elm) {
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

  saveChanges: function (doc, form) {
    Tpl.clearErrors(form);
    if (doc.$save()) {
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
      Bart.removeClass(msgs[msgs.length - 1], 'error');
    }
  },

  renderErrors: function (doc, form) {
    var errors = doc._errors;
    var focus = null;
    var otherMsgs = [];
    Tpl.clearErrors(form);


    if (errors) {
      for(var field in errors) {

        var msg = AppVal.Error.msgFor(doc, field);
        if (msg) {
          var fieldElm = Tpl.renderError(form, field, msg);
          if (fieldElm)
            focus = focus || fieldElm;
          else
            otherMsgs && otherMsgs.push([field,msg]);
        }
      }
      if (otherMsgs.length > 0) {
        console.log('Unexpected errors: ', (typeof geddon !== 'undefined' && geddon.test.name), JSON.stringify(otherMsgs));
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
    if (! (msgElm && Bart.hasClass(msgElm, 'errorMsg'))) {
      msgElm = document.createElement('span');
      Bart.addClass(msgElm, 'errorMsg');
      fieldElm.parentNode.insertBefore(msgElm, fieldElm.nextElementSibling);
    }

    Bart.addClass(fieldElm, 'error');
    msgElm.textContent = msg;
    return fieldElm;
  },

  addChangeFields: function (template, fields, action) {
    action = action || 'change';
    var events = {};
    for(var i=0;i < fields.length;++i) {
      var field = fields[i];
      if (action === 'change' && field.match(/color/i)) {
        events['click [name=' + field + ']'] = changeColorEvent(template, field);
      } else {
        events[action + ' [name=' + field + ']'] = changeFieldEvent(template, field);
      }
    }
    Bart[template].$events(events);
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
    Bart.setBoolean('checked', this.checked);
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
  sl.forEach(function (row) {
    var rowValue = getValue(row);
    elm.appendChild(optionFunc(rowValue, getContent(row), rowValue == value));
  });
}

var errorMsg = document.createElement('span');
errorMsg.className = 'errorMsg';

Bart.registerHelpers({
  errorMsg: function () {
    var elm = Bart.current.element;
    return Bart.hasClass(elm, 'errorMsg') ? elm : errorMsg.cloneNode(true);
  },

  checked: function (value) {
    Bart.setBoolean('checked', value);
  },

  elmId: function (prefix) {
    if (prefix)
      return prefix + '_' + this._id;
    else
      return AppClient.domId(this);
  },

  field: function (name, options) {
    return field(this, name, options);
  },

  labelField: function (name, options) {
    return Tpl.LabelField.$autoRender({
      name: name,
      value: field(this, name, options),
      label: (options && options.label) ||  Apputil.capitalize(Apputil.humanize(name)),
    });
  },

  displayField: function (name, options) {
    var value = document.createElement('span');
    value.className = 'value';
    value.textContent = this[name];
    return Tpl.LabelField.$autoRender({
      name: name,
      value: value,
      label: (options && options.label) ||  Apputil.capitalize(Apputil.humanize(name)),
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

Tpl.OnOff.$helpers({
  classes: function () {
    return this.doc[this.name] ? 'on onOff' : 'onOff';
  },
});

Tpl.OnOff.$events({
  'click': function (event) {
    var data = $.ctx.data;
    Bart.toggleClass(this, 'on');
    data.doc[data.name] = ! data.doc[data.name];
  },
});

function helpers(name, funcs) {
  Tpl[name].$helpers(App.reverseExtend(funcs, DEFAULT_HELPERS));
}

function field(doc, name, options) {
  options = options || {};
  if ('selectList' in options) {
    return Tpl[options.type === 'radio' ? 'Radio' : 'Select'].$autoRender({name: name, doc: doc, options: options});
  }

  switch(options.type || 'text') {
  case 'markdownEditor':
    return Bart.MarkdownEditor.$autoRender({content: doc[name], options: App.reverseExtend({"data-errorField": name}, options)});
  case 'onOff':
    return Tpl.OnOff.$autoRender({name: name, doc: doc, options: options});
  default:
    return Tpl.TextInput.$autoRender({type: options.type || 'text', name: name, doc: doc, options: options});
  }

}

function changeColorEvent(formId, field) {
  return function (event) {
    Bart.stopEvent();
    var doc = $.data();

    Bart.ColorPicker.choose(doc[field], function (result) {
      if (result) {
        doc[field] = result;
        Tpl.saveChanges(doc, document.getElementById(formId));
      }
    });
  };
}

function changeFieldEvent(formId, field) {
  return function (event) {
    Bart.stopEvent();
    var doc = $.data();

    var value;
    switch (this.type) {
    case 'checkbox':
      value = this.checked;
      break;
    default:
      value = this.value;
    }

    doc[field] = value;
    Tpl.saveChanges(doc, document.getElementById(formId));
  };
}
