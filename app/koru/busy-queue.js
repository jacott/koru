define(function(require, exports, module) {
  class BusyQueue {
    constructor(subject) {
      this.subject = subject;
      this.whenIdle = this.whenBusy = null;
      this.first = this.last = null;
    }

    queueAction(action) {
      if (this.last)
        this.last = this.last.next = {action};
      else {
        this.first = this.last = {action};
        this.whenBusy && this.whenBusy(this.subject);
        action(this.subject);
      }
    }

    get isBusy() {return !! this.first}

    nextAction() {
      const entry = this.first.next;
      if (entry) {
        this.first = this.first.next;
        entry.action(this.subject);
      } else {
        this.first = this.last = null;
        this.whenIdle && this.whenIdle(this.subject);
      }
    }
  }

  return BusyQueue;
});
