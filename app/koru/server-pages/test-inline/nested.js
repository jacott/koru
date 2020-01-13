define(require =>{
  const Simple = require("./simple");
  const Level2 = require('./level2');

  return ()=> "nested, "+Level2()+", "+Simple;
});
