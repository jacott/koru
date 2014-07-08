define(function () {
  return function (doc, field, validator) {
    validator && validator.call(doc, field);
  };
});
