define(function () {
  var colorRe = /^#([0-9a-f]{2}){3}?$/;
  var alphaColorRe = /^#([0-9a-f]{2}){3,4}?$/;

  return {
    normalize: function (doc,field, options) {
      var val = doc[field];
      if (! val) return;

      if (options === 'downcase') {
        doc[field] = val.toLowerCase();

      } else if (options === 'upcase') {
        doc[field] = val.toUpperCase();
      }
    },

    color: function (doc,field, alpha) {
      var val = doc[field];
      if (val && ! (alpha === 'alpha' ? alphaColorRe : colorRe).test(val))
        this.addError(doc,field,'is_invalid');
    },

    date: function (doc,field, options) {
      var val = doc[field];

      if (val === '') {
        doc[field] = null;
        return;
      }

      if (val == null) return;

      if (options === true || options == null) options = {};

      if (! (val && val.constructor === Date && val.getDate() === val.getDate())) {
        if (typeof val !== 'string' || ((val = new Date(Date.parse(val))) && val.getDate() !== val.getDate()))
          return this.addError(doc,field,'not_a_date');
      }

      doc[field] = val;
    },

    number: function (doc,field, options) {
      var val = doc[field];

      if (val === '') {
        doc[field] = null;
        return;
      }

      if (val == null) return;

      if (options === true || options == null) options = {};

      if (typeof val !== 'number') {
        if (typeof val === 'string' && +val === +val)
          val = +val;
        else
          return this.addError(doc,field,'not_a_number');
      }

      if (options.integer && val !== Math.floor(val))
        return this.addError(doc,field,'not_an_integer');

      if (options.$lte != null && val > options.$lte)
        return this.addError(doc,field,'cant_be_greater_than', options.$lte);

      if (options.$lt != null && val >= options.$lt)
        return this.addError(doc,field,'must_be_less_than', options.$lt);

      if (options.$gte != null && val < options.$gte)
        return this.addError(doc,field,'cant_be_less_than', options.$gte);

      if (options.$gt != null && val <= options.$gt)
        return this.addError(doc,field,'must_be_greater_than', options.$gt);

      doc[field] = val;
    },

    boolean: function (doc, field, boolType) {
      var val = doc[field];

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


        if (! val && boolType === 'trueOnly')
          doc[field] = undefined;
        else if (val === false || val === true)
          doc[field] = val;
        else
          this.addError(doc,field,'not_a_boolean');
      }
    },

    trim: function (doc, field, type) {
      var val = doc[field];

      if (val != null) {
        if (typeof val !== 'string')
          this.addError(doc,field,'not_a_string');
        else {
          val = val.trim();
          if (! val) {
            switch(type) {
            case 'toNull':
              val = null;
              break;
            case 'toUndefined':
              val = undefined;
              break;
            }
          }
          doc[field] = val;
        }
      }
    },
  };
});
