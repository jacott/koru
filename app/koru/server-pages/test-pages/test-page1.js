define(()=>{
  return ({View, Controller}) => {
    View.$helpers({
      foo() {return this.params.id}
    });

    class TestPage1 extends Controller {
    }
    return TestPage1;
  };
});
