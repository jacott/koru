define(function(require, exports, module) {
  return function (selector, callbacks) {
    var ok = callbacks.ok || function () {};
    var cancel = callbacks.cancel || function () {};

    var events = {};
    'keyup keydown focusout'.split(' ').forEach(function (action) {
      events[action + ' ' + selector] = onevent;
    });

    function onevent(evt) {
      if (evt.type === "keydown" && evt.which === 27) {
        // escape = cancel
        cancel.call(this, evt);

      } else if (evt.type === "keyup" && evt.which === 13 ||
                 evt.type === "focusout") {
          // blur/return/enter = ok/submit if non-empty
        var value = String(this.value || "");
        if (value)
          ok.call(this, value, evt);
        else
          cancel.call(this, evt);
      }
    };

    _bart_.debug('events', events);


    return events;
  };
});
