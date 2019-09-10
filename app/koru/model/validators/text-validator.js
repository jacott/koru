define((require)=>{
  'use strict';
  /**
   * Text validation and conversion.
   **/
  const UtilDate        = require('koru/util-date');

  const compiled$ = Symbol();

  const alphaColorRe = /^#([0-9a-f]{2}){3,4}?$/;



  return {
    normalize(doc, field, options) {
      if (! doc.$hasChanged(field)) return;

      const val = doc[field];
      if (val !== '' && val != null &&
          (options === 'downcase' || options == 'upcase')) {
        if (typeof val !== 'string') {
          this.addErrorIfNone(doc, field, 'not_a_string');
        } else {
          const conv = options === 'upcase' ? val.toUpperCase() : val.toLowerCase();
          if (conv !== val) doc[field] = conv;
        }
      }
    },

    color(doc, field, alpha) {
      const val = doc[field];
      if (val != null) {
        if (val == '') doc[field] = null;
        else if (alphaColorRe.test(val)) {
          if (alpha !== 'alpha' && val.length == 9) {
            doc[field] = val.slice(0, 7);
          }
        } else {
          this.addError(doc, field,'is_invalid');
        }
      }
    },

    date(doc,field, options) {
      let val = doc[field];

      if (val === '') {
        doc[field] = null;
        return;
      }

      if (val == null) return;

      if (options === true || options == null) options = {};

      if (! (val && val.constructor === Date && val.getDate() === val.getDate())) {
        if (typeof val !== 'string' ||
            (val = UtilDate.parse(val)) && val.getDate() !== val.getDate())
          return this.addErrorIfNone(doc,field,'not_a_date');
      }

      doc[field] = val;
    },

    number(doc,field, options) {
      let val = doc[field];

      if (val === '') {
        doc[field] = null;
        return;
      }

      if (val == null) return;

      if (typeof val !== 'number') {
        if (typeof val === 'string' && +val === +val)
          val = +val;
        else
          return this.addErrorIfNone(doc,field,'not_a_number');
      }

      if (options != null) {
        if (options === 'integer' || options.integer) {
          const rnd = Math.round(val);
          if (val !== rnd) {
            if (options.integer === 'convert')
              val = rnd;
            else
              return void this.addErrorIfNone(doc, field, 'not_an_integer');
          }
        }
        if (typeof options === 'object') {
          if (options[compiled$] === void 0) {
            const tests = options[compiled$] = [];
            {
              let exp = options['<='];
              if (exp === void 0) exp = options.$lte;
              if (exp !== void 0)
                tests.push({test: val => val <= exp, args: ['cant_be_greater_than', exp]});
            }
            {
              let exp = options['>='];
              if (exp === void 0) exp = options.$gte;
              if (exp !== void 0)
                tests.push({test: val => val >= exp, args: ['cant_be_less_than', exp]});
            }
            {
              let exp = options['<'];
              if (exp === void 0) exp = options.$lt;
              if (exp !== void 0)
                tests.push({test: val => val < exp, args: ['must_be_less_than', exp]});
            }
            {
              let exp = options['>'];
              if (exp === void 0) exp = options.$gt;
              if (exp !== void 0)
                tests.push({test: val => val > exp, args: ['must_be_greater_than', exp]});
            }
          }
          const tests = options[compiled$];
          for(let i = tests.length-1; i >= 0; --i) {
            const row = tests[i];
            if (! row.test(val))
              return void this.addError(doc, field, ...row.args);
          }
        }
      }
      doc[field] = val;
    },

    boolean(doc, field, boolType) {
      const orig = doc[field];
      let val = orig;

      if (val != null) {
        if (typeof val === 'string') {
          val = val.trim().toLowerCase();
          switch (val) {
          case 'true': case 'on': case '1': case 't':
            val = true;
            break;
          case 'false': case 'off': case '0': case 'f':
            val = false;
            break;
          }
        }

        if (val === false && boolType === 'trueOnly') {
          doc[field] = void 0;
        } else if (val === false || val === true) {
          if (val !== orig) doc[field] = val;
        } else
          this.addErrorIfNone(doc, field, 'not_a_boolean');
      }
    },

    trim(doc, field, type) {
      let val = doc[field];

      if (val != null) {
        if (typeof val !== 'string')
          this.addErrorIfNone(doc, field, 'not_a_string');
        else {
          val = val.trim();
          if (! val) {
            switch(type) {
            case 'toNull':
              val = null;
              break;
            case 'toUndefined':
              val = void 0;
              break;
            }
          }
          doc[field] = val;
        }
      }
    },
  };
});
