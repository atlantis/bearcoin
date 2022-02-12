pragma solidity ^0.8.10;

import "./DevBearcoin.sol";

contract TestBearcoin is DevBearcoin {
  event Debug(uint256 value);
  event Debug(address value);
  event Debug( bool value );
  event Debug(bytes32 value);

  int256 private testBitcoinPrice = 6077532000000;

  function testSetBitcoinPrice(int256 price) public returns (bool) {
    testBitcoinPrice = price;
    updateInflationDeflationRate();
    return true;
  }

  function _fetchBitcoinPrice() internal override view returns (int256) {
    return testBitcoinPrice;
  }

  function testInflateOrDeflateAmount(uint256 amount) public view returns (uint256)  {
    return inflateOrDeflateAmount(amount);
  }

  function testSetLastRateUpdateAt( uint256 timestamp) public {
    _lastRateUpdateAt = timestamp;
  }

  //Have to comment out LINK and requestRandomness
  function testPerformUpkeep(bytes calldata /* performData */) external {
    _lastUpkeepAt = block.timestamp;

    //Don't even try if we'd fail
    if ( block.timestamp >= _lastRateUpdateAt + bitcoinPriceUpdateRateLimitSeconds ) {
      updateInflationDeflationRate();
    }

    if ( block.timestamp >= _lastRandomSeedUpdateAt + randomSeedUpdateSeconds ) {
      //Can't test this part
    }
  }
}