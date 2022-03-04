// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.10;

import "./BearcoinBase.sol";

contract DevBearcoin is BearcoinBase {
  event DebugUint256(uint256 value);
  event DebugAddress(address value);
  event DebugBool( bool value );
  event DebugBytes32(bytes32 value);

  constructor() ERC20("BTC Bearcoin", "BTCBEAR") VRFConsumerBase(
        0x8C7382F9D8f56b33781fE506E897a4F1e2d17255, // VRF Coordinator
        0x326C977E6efc84E512bB9C30f76E30c160eD06FB  // LINK Token
    )
  {
    _priceFeed = AggregatorV3Interface(0x007A22900a3B98143368Bd5906f8E17e9867581b);  //Polygon Testnet BTC / USD

    //Randomness
    s_keyHash = 0x6e75b569a01ef56d18cab6a8e71e6600d6ce853834d4a5748b720d06f878b3a4;

    _rateLimitUpdateInflationRate = false;

    onDeploy();
  }

  function devSetGenesisTimestamp( uint256 timestamp ) public onlyOwner {
    _genesisTimestamp = timestamp;
  }

  function devSetGenesisBitcoinPrice( uint256 price ) public onlyOwner {
    _genesisBitcoinPrice = price;
  }

  function devSetCurrentBitcoinPrice( uint256 price ) public onlyOwner {
    _bitcoinPrice = price;
  }

  function devSetLastRateUpdateAt( uint256 timestamp ) public onlyOwner {
    _lastRateUpdateAt = timestamp;
  }

  function devSetLastRandomSeedUpdateAt( uint256 timestamp ) public onlyOwner {
    _lastRandomSeedUpdateAt = timestamp;
  }

  function devSetRandomSeed( uint256 seed ) public onlyOwner {
    _randomSeed = seed;
  }

  function devRandomSeed() public view onlyOwner returns (uint256) {
    return _randomSeed;
  }

  function devSetLastUpkeepAt( uint256 timestamp ) public onlyOwner {
    _lastUpkeepAt = timestamp;
  }

  function devPerformUpkeepUpdateRate( bytes calldata /* performData */ ) external onlyOwner {
    updateInflationDeflationRate();
  }

  function devPerformUpkeepCheckLink( bytes calldata /* performData */ ) external onlyOwner {
    if ( LINK.balanceOf(address(this)) >= s_fee ) {
      emit DebugBool(true);
    }
    else {
      emit DebugBool(false);
    }
  }

  function devPerformUpkeepRequestRandomness( bytes calldata /* performData */ ) external onlyOwner {
    requestRandomness(s_keyHash, s_fee);
  }

  function devSetAirdropStartAt( uint256 timestamp ) public onlyOwner {
    _airdropStartAt = timestamp;
    emit DebugUint256(_airdropStartAt);
  }

  function devAirdrop() external onlyOwner {
    airdrop();
  }

  function devSetLastAirdropAt( uint256 timestamp ) public onlyOwner {
    _lastAirdropAt = timestamp;
  }
}