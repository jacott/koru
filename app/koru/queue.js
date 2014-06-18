var Future = requirejs.nodeRequire('fibers/future');
/**
 * Wait for turn in queue. Will block for earlier queued functions.
 *
 * Server only
 */
define(function(require, exports, module) {
  return function () {
    var queues = {};

    function Queue(name) {
      this.name = name;
      this.running = false;
    }

    Queue.prototype = {
      constructor: Queue,

      add: function (func) {
        if (this.running) {
          if (this.queued == null)  {
            this.queued = 1;
            this.runNext = 1;
            this.futures = {};
          } else {
            ++this.queued;
          }

          var future = this.futures[this.queued] = new Future();
          future.wait();
        }

        this.running = true;

        try {
          var result = func();
        } catch(ex) {
          var error = ex;
        }
        if (this.queued) {
          var future = this.futures[this.runNext];
          if (future) {
            delete this.futures[this.runNext];
            ++this.runNext;
            future.return();
          }
        } else {
          delete queues[this.name];
        }
        if (error) throw error;
        return result;
      }
    };


    return function (name, func) {
      return (queues[name] || (queues[name] = new Queue(name))).add(func);
    };
  };
});
