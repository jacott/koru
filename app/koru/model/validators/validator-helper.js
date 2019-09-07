define((require, exports, module)=>{
  const BaseModel       = require('koru/model/base-model');
  const Val             = require('koru/model/validation');
  const util            = require('koru/util');

  const {error$, inspect$} = require('koru/symbols');

  const fields$ = Symbol(), validator$ = Symbol();

  class ModelStub extends BaseModel {
    static registerValidator(validator) {
      this[validator$] = validator;
    }

    static defineFields(fields) {
      const proto = this.prototype;
      this[fields$] = fields;
      for (const field in fields) {
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
          }
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
      for (const name in this.constructor[fields$]) {
        arg = this[name];
      }
      return `Model.${this.constructor.modelName}("${arg}")`;
    }


    $isValid() {
      this[error$] = void 0;
      const fields = this.constructor[fields$];
      const validators = this.constructor[validator$];
      for (const field in fields) {
        const fieldOps = fields[field];
        for (const name in fieldOps) {
          const validator = validators[name];
          if (validator !== void 0) {
            const options = fieldOps[name];
            validator.call(
              Val, this, field,
              typeof options === 'function' ? options.call(this, field, fieldOps) : options,
              fieldOps);
          }
        }
      }
      return this[error$] === void 0;
    }
  }

  return {
    ModelStub,
  };

});
