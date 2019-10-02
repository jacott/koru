define((require, exports, module)=>{
  const TH              = require('koru/test-helper');

  const BigInteger = require('./big-integer');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    test("modPow", ()=>{
      const a = new BigInteger("-29694681763448712115267303514023904033265211886910761264672576231554464098637402550663040547342726600568933793424522580102024307390684120501123145913181335140054630257537266316462992944143291789428368597319366497044735307450905133722212599357295495795914532499656994934020209866067682479620381834108247731805362251476372300643310863145482504070318221407436590709353870667746678473405580031604287313646969125892734476605404502107124001169091069970155161376239893444309019800637825991490992886756114995636568690097893351815480034167383046629554600914654853770556603406920385489591581795592966209762321826324786588707444458373503608685515834491712886834370824573830770838543360344886700981870");
      const e = new BigInteger("119334647663227291363113405741243413916434827363146166012200067038894142816254113710841716638008805209543910927476491099816542561560345503311330152550056221240122563520612198703057065667637570340647063422988042473190059156975005813463818646696643573820202000369152615667401021816298491297653620614440782978764393137821956464627163145421579373439868081673415678986432326806001408975760610901250649711198896213496068605039486228645916762983047459546900860937537474723612261449751343757826252579432285178556676653805951590208797794400875516522254480074885052650095801006651270614765243081674516367874973021395155320563");
      const m = new BigInteger("21766174458617435773191008891802753781907668374255538511144643224689886235383840957210909013086056401571399717235807266581649606472148410291413364152197364477180887395655483738115072677402235101762521901569820740293149529620419333266262073471054548368736039519702486226506248861060256971802984953561121442680157668000761429988222457090413873973970171927093992114751765168063614761119615476233422096442783117971236371647333871414335895773474667308967050807005509320424799678417036867928316761272274230314067548291133582479583061439577559347101961771406173684378522703483495337037655006751328447510550299250924469288819");
      const expect = "72324557783415787424155521118202596834933898242395886137674358852236580794269836377307287786755289962440782013831739423702014967616850758313183751932896777891669089456853771795527757996329325050996269324970201536028633484579111946278204478269805106124073503820660024439715627250378312057531479971103107712537148991421528677788413535635435770715226291273808528964474082509191820953587881465428407150420995055514194080761192776104785866884604229750694117199160680355057545631740521663782384430018469927006099212868328005800482010975321397684122860835203872900466151550540270815104453823592754896203799696226528729895";

      const p = a.modPow(e, m);

      assert.same((p.isNegative() ? p.add(m) : p).toString(), expect);
    });
  });
});