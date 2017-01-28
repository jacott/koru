/**
 * This is mostly a copy of Meteor.com's errors.js file.
 *
 * See Also:
 *   http://davidshariff.com/blog/javascript-inheritance-patterns/
 *
 * MIT License
 */

define(function(require) {
  var util = require('koru/util');

  // http://davidshariff.com/blog/javascript-inheritance-patterns/
  var inherits = function (child, parent) {
    var tmp = function () {};
    tmp.prototype = parent.prototype;
    child.prototype = new tmp;
    child.prototype.constructor = child;
  };

  // Makes an error subclass which properly contains a stack trace in most
  // environments. constructor can set fields on `this` (and should probably set
  // `message`, which is what gets displayed at the top of a stack trace).
  //
  function makeErrorType(name, constructor) {
    var errorClass = function (...args) {
      var self = this;

      // Ensure we get a proper stack trace in most Javascript environments
      if (Error.captureStackTrace) {
        // V8 environments (Chrome and Node.js)
        Error.captureStackTrace(self, errorClass);
      } else {
        // Firefox
        var e = new Error;
        e.__proto__ = errorClass.prototype;
        if (e instanceof errorClass)
          self = e;
      }
      // Safari magically works.

      constructor.apply(self, args);

      self.errorType = name;

      return self;
    };

    inherits(errorClass, Error);

    return errorClass;
  };

  return {
    makeErrorType: makeErrorType,

    Error: makeErrorType("KoruError", function (error, reason, details) {
      var self = this;

      // Currently, a numeric code, likely similar to a HTTP code (eg,
      // 404, 500). That is likely to change though.
      self.error = error;

      // Optional: A short human-readable summary of the error. Not
      // intended to be shown to end users, just developers. ("Not Found",
      // "Internal Server Error")
      self.reason = reason;

      // Optional: Additional information about the error, say for
      // debugging. It might be a (textual) stack trace if the server is
      // willing to provide one. The corresponding thing in HTTP would be
      // the body of a 404 or 500 response. (The difference is that we
      // never expect this to be shown to end users, only developers, so
      // it doesn't need to be pretty.)
      self.details = details;

      // This is what gets displayed at the top of a stack trace. Current
      // format is "[404]" (if no reason is set) or "File not found [404]"

      Object.defineProperty(self, 'message', {get() {
        var code = '[' + this.error + ']';
        if (this.reason == null) return code;
        code = ' ' + code;
        if (typeof this.reason === 'string')
          return this.reason + code;
        else
          return util.inspect(this.reason) + code;
      }});
    }),
  };
});
