/**
 * Wait for turn in queue. Will block for earlier queued functions.
 *
 * Server only
 */
define((require) => (type) => {
  'use strict';
  const util            = require('koru/util');

  const queues = type === 'single' ? null : {};

  const finish = (queue) => {
    queue.running = false;
    queues && delete queues[queue.name];
  };

  class Queue {
    constructor(name) {
      this.name = name;
      this.running = false;
    }

    add(func) {
      if (this.running) {
        this.isPending = true;
        if (this.queued == null) {
          this.queued = 1;
          this.runNext = 1;
          this.futures = {};
        } else {
          ++this.queued;
        }

        (this.futures[this.queued] = new util.Future()).wait();
      }

      this.isPending = false;
      this.running = true;

      let result, error;
      try {
        result = func(this);
      } catch (ex) {
        error = ex;
      }
      if (this.queued) {
        const future = this.futures[this.runNext];
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
  }

  if (queues) {
    return (name, func) => {
      return (queues[name] || (queues[name] = new Queue(name))).add(func);
    };
  } else {
    return new Queue();
  }
});
