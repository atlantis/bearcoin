const Bearcoin = artifacts.require("TestBearcoin");

contract("Bearcoin", accounts => {
  let bearcoin;
  let genesisPrice;
  let oneCoin = 100000000;
  beforeEach('should setup the contract instance', async () => {
    bearcoin = await Bearcoin.deployed();
    genesisPrice = await bearcoin.genesisBitcoinPrice();
  });

  it("should have working transferFrom during 1.5% deflation", async () => {
    let account1 = accounts[3];
    let account2 = accounts[4];

    await bearcoin.enableInflationDeflation({from: account2});
    await bearcoin.testSetBitcoinPrice(genesisPrice * 985 / 1000);
    await bearcoin.transfer(account1, oneCoin * 120);

    let totalSupply = await bearcoin.totalSupply();
    assert.equal(
      totalSupply.toString(),
      (21000000 * oneCoin).toString(),
      "initial supply not correct"
    );

    let amount = await bearcoin.balanceOf.call(account1);

    await bearcoin.approve(account2, amount, {from: account1});  //account1 allows account2 to transfer the whole balance

    await bearcoin.transferFrom(account1, account2, amount, {from: account2})  //account2 transfers entire balance

    // let balance1 = await bearcoin.balanceOf.call(account1);

    // assert.equal(
    //   balance1.toString(),
    //   "0",
    //   "balance of account 1 not correct"
    // );

    // var balance2 = await bearcoin.balanceOf.call(account2);

    // assert.equal(
    //   balance2.toString(),
    //   amount.toString(),
    //   "original balance of account 2 not correct"
    // );

    // await bearcoin.transfer(account1, 1);  //do a small normal transfer to burn deflation

    // balance2 = await bearcoin.balanceOf.call(account2);

    // assert.equal(
    //   balance2.toString(),
    //   Math.round(amount * 985 / 1000).toString(),
    //   "deflated balance of account 2 not correct"
    // );

    // let newTotalSupply = await bearcoin.totalSupply();

    // assert.equal(
    //   newTotalSupply.toString(),
    //   (totalSupply.sub( web3.utils.toBN(1.8 * oneCoin) )).toString(),
    //   "deflated total supply not correct"
    // );
  });

//   it("should have working transferFrom during max inflation", async () => {
//     let account1 = accounts[5];
//     let account2 = accounts[6];

//     await bearcoin.enableInflationDeflation({from: account2});
//     await bearcoin.testSetBitcoinPrice(genesisPrice * 1100 / 1000); //will be capped at 5%
//     await bearcoin.transfer(account1, oneCoin * 120);

//     let amount = await bearcoin.balanceOf.call(account1);

//     await bearcoin.approve(account2, amount, {from: account1});  //account1 allows account2 to transfer the whole balance
//     await bearcoin.transferFrom(account1, account2, amount, {from: account2});  //account2 transfers entire balance

//     let balance1 = await bearcoin.balanceOf.call(account1);

//     assert.equal(
//       balance1.toString(),
//       "0",
//       "balance of account 1 not correct"
//     );

//     var balance2 = await bearcoin.balanceOf.call(account2);

//     assert.equal(
//       balance2.toString(),
//       amount.toString(),
//       "balance of account 2 not correct"
//     );

//     await bearcoin.transfer(account1, 1);  //do a small normal transfer to burn deflation

//     balance2 = await bearcoin.balanceOf.call(account2);

//     assert.equal(
//       balance2.toString(),
//       amount.toString(),
//       "balance of account 2 not correct"
//     );
//   });
});