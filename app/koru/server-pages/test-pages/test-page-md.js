define(()=>{
  return ({View, Controller}) => {
    View.$helpers({
      foo() {return "Markdown"}
    });

    class TestPageMd extends Controller {
    }
    return TestPageMd;
  };
});
