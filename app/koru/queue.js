var Future = requirejs.nodeRequire('fibers/future');
/**
 * Wait for turn in queue. Will block for earlier queued functions.
 *
 * Server only
 */
define(function(require, exports, module) {
  return function (type) {
    var queues = type === 'single' ? null : {};

    function Queue(name) {
      this.name = name;
      this.running = false;
    }

    Queue.prototype = {
      constructor: Queue,

      add: function (func) {
        if (this.running) {
          this.isPending = true;
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

        this.isPending = false;
        this.running = true;

        try {
          var result = func(this);
        } catch(ex) {
          var error = ex;
        }
        if (this.queued) {
          var future = this.futures[this.runNext];
          if (future) {
            delete this.futures[this.runNext];
            ++this.runNext;

            future.return();
          } else {
            finish(this);
          }
        } else {
          finish(this);
        }
        if (error) throw error;
        return result;
      }
    };

    function finish(queue) {
      queue.running = false;
      queues && delete queues[queue.name];
    }

    if (queues)
      return function (name, func) {
        return (queues[name] || (queues[name] = new Queue(name))).add(func);
      };
    else
      return new Queue();
  };
});
