/**
 * Wait for turn in queue. Will block for earlier queued functions.
 *
 * Server only
 */
define((require) => (type) => {
  'use strict';
  const Future          = require('koru/future');

  const queues = type === 'single' ? null : {};

  class Queue {
    constructor(name) {
      this.name = name;
      this.isPending = this.running = false;
      this.head = this.tail = undefined;
    }

    async add(func) {
      if (this.running) {
        this.isPending = true;
        const future = new Future();
        future.next = undefined;
        if (this.head === undefined) {
          this.head = this.tail = future;
        } else {
          this.tail = this.tail.next = future;
        }

        await future.promise;
      }

      this.running = true;

      let result, error;
      try {
        result = await func(this);
      } catch (ex) {
        error = ex;
      }

      if (this.head !== undefined) {
        const future = this.head;
        this.head = future.next;
        if (this.head === undefined) {
          this.tail = undefined;
          this.isPending = false;
        }
        future.resolve();
      } else {
        this.running = false;
        queues && delete queues[this.name];
      }
      if (error) throw error;
      return result;
    }
  }

  if (queues) {
    return (name, func) => {
      return (queues[name] ??= new Queue(name)).add(func);
    };
  } else {
    return new Queue();
  }
});
