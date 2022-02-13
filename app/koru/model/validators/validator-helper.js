define((require, exports, module) => {
  const BaseModel       = require('koru/model/base-model');
  const util            = require('koru/util');

  const {error$, inspect$} = require('koru/symbols');

  const validator$ = Symbol();

  class ModelStub extends BaseModel {
    static registerValidator(validator) {
      this[validator$] = validator;
    }

    static defineFields(fields) {
      const proto = this.prototype;
      this.$fields = fields;
      const vtors = this._fieldValidators = {};
      for (const field in fields) {
        const opts = fields[field];
        const vf = vtors[field] = {};
        for (const val in opts) {
          const valFunc = this[validator$][val];
          if (valFunc !== undefined) {
            vf[val] = [valFunc, opts[val], opts];
          }
        }
        Object.defineProperty(proto, field, {
          configurable: true,
          get() {
            const val = util.hasOwn(this.changes, field) ? this.changes[field] : this.attributes[field];
            return val === null ? void 0 : val;
          },

          set(value) {
            const {changes} = this;
            if (value === null) value = void 0;
            if (value === this.attributes[field]) {
              if (util.hasOwn(changes, field)) delete this.changes[field];
            } else {
              changes[field] = value;
            }
            return value;
          },
        });
      }
    }

    static build(attrs) {
      const doc = new this();
      Object.assign(doc, attrs);
      this.modelName = this.name;
      return doc;
    }

    [inspect$]() {
      let arg = '';
      for (const name in this.constructor.$fields) {
        arg = this[name];
      }
      return `Model.${this.constructor.modelName}("${arg}")`;
    }
  }

  return {
    ModelStub,
  };
});
