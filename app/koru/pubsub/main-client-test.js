define((require)=>{
  'use strict';
  const Subscription    = require('koru/pubsub/subscription');
  const SubscriptionSession = require('koru/pubsub/subscription-session');
  const Session         = require('koru/session');
  const api             = require('koru/test/api');

  return ({TH, module}) =>{
    const {stub, spy, util} = TH;

    TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
      before(()=>{
        api.module({pseudoModule: 'Overview'});
      });

      after(()=>{
        SubscriptionSession.unload(Session);
      });

      test("client-subscription", ()=>{
        api.topic();

        const lookupLastSubscribed = (sub)=>{
          return new Date(2019, 0, 1, 20, 22, 34);
        };

        const Book = {modelName: 'Book', onChange: stub()};

        //[
        // Step 1 - Register the subscription
        class LibrarySub extends Subscription {
          constructor(args) {
            super(args);
            const {shelf} = this.args;
            this.match(Book, doc => doc.shelf === self);
          }
          async connect() {
            // step 2 from below calls this
            this.lastSubscribed =
              await lookupLastSubscribed(this);
            // connect to server
            super.connect();
          }

          reconnecting() {
            Book.query.forEach(Subscription.markForRemove);
          }
        }
        LibrarySub.pubName = "Library";
        //]

        //[
        // Step 2 - subscribe
        const sub = LibrarySub.subscribe({shelf: 'mathematics'}, error =>{
          // Step 4 - server has sent responses
          if (error) {
            // handle error
          } else {
            assert(Book.where('shelf', 'mathematics').exists());
          }
        });
        //]

        //[
        // Listening for book changes
        const bookHandle = Book.onChange(dc => {
          // Step 6 - receive book change
          if (dc.doc.name === "Euclid's Elements") {
            dc.doc.readBook();
          }
        });
        //]


        //[
        // Step 7 - send close to server
        sub.stop();
        //]


        assert.same(sub.state, 'stopped');
      });
    });
  };
});
