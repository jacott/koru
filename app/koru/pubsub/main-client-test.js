define((require)=>{
  const Subscription    = require('koru/pubsub/subscription');
  const SubscriptionSession = require('koru/pubsub/subscription-session');
  const Session         = require('koru/session');
  const api             = require('koru/test/api');

  return ({TH, module}) =>{
    const {stub, spy, onEnd, util} = TH;

    TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
      before(()=>{
        api.module({pseudoModule: 'Overview'});
      });

      after(()=>{
        SubscriptionSession.unload(Session);
      });

      test("client-subscription", ()=>{
        api.topic();

        const lookupLastSubscribed = (options)=>{
          return new Date(2019, 0, 1, 20, 22, 34);
        };

        const Book = {onChange: stub()};

        //[
        // Step 1 - Register the subscription
        class LibrarySub extends Subscription {
          async connect(options) {
            // step 2 from below calls this
            const {shelf} = options;
            this.match(Book, doc => doc.shelf === self);
            this.lastSubscribed =
              await lookupLastSubscribed(options);
            // connect to server
            super.connect(options);
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
