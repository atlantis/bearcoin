// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.10;

import "./DevBearcoin.sol";

contract TestBearcoin is DevBearcoin {
  event Debug(uint256 value);
  event Debug(address value);
  event Debug( bool value );
  event Debug(bytes32 value);

  int256 private testBitcoinPrice = 6077532000000;
  bool internal _bypassUpkeepRandomness = true;  //Want predictable behavior

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

  //Have to comment out randomn execution of each action (for consistent results), as well as requestRandomness
  function performUpkeep(bytes calldata /* performData */) public override {
    _lastUpkeepAt = block.timestamp;

    // if ( random(1) % 3 == 1 ) {
      //Don't even try if we'd fail
      if ( block.timestamp >= _lastRateUpdateAt + bitcoinPriceUpdateRateLimitSeconds ) {
        updateInflationDeflationRate();
      }
    // }

    // if ( random(2) % 3 == 1 ) {
      //Rate limit to protect from draining LINK from the contract...
      if ( block.timestamp >= _lastRandomSeedUpdateAt + _randomSeedUpdateSeconds ) {
        //Be careful not to attempt this unless we have enough LINK
        // if ( LINK.balanceOf(address(this)) >= s_fee ) {
        //   requestRandomness(s_keyHash, s_fee);
        // }
        // else {
        //   emit InsufficientLINK();
        // }
      }
    // }

    // if ( random(3) % 3 == 1 ) {
      if ( _airdropStartAt > 0 && _lastAirdropAt < block.timestamp - 86400 && balanceOf(address(this)) > 0 ) {
        //This may be called multiple times until the airdrop is complete for the current day
        airdrop();
      }
      else if ( _airdropStartAt == 0 && block.timestamp > _genesisTimestamp + (86400 * _forceStartAirdropDays) ) {
        //Force the airdrop to start if it hasn't already after too long
        _startAirdrop();
      }
    // }
  }
}