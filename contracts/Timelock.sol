// SPX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ParadoxTimelock is Ownable {
    IERC20 public paradox;

    uint256 private immutable cliff;
    uint256 private immutable rate;
    uint256 private immutable total;
    uint256 private immutable startTime;
    uint256 private immutable denominator;

    uint256 public claimed;

    error NotStarted();
    error CliffNotDone();

    event Claimed(address recipient, uint256 amount);

    /**
        @param _paradox The address of the PARADOX token
        @param _cliff The amount of time in days before the first claim can be made
        @param _rate The amount of tokens to claim per month
        @param _total The total amount of claimable tokens
        @param _startTime The time in seconds when the timelock starts
        @param _denominator The denominator used to calculate the amount of tokens to claim
     */
    constructor(
        address _paradox,
        uint256 _cliff,
        uint256 _rate,
        uint256 _total,
        uint256 _startTime,
        uint256 _denominator
    ) {
        paradox = IERC20(_paradox);
        cliff = _cliff;
        rate = _rate;
        total = _total;
        startTime = _startTime;
        denominator = _denominator;
    }

    function claim(address _recipient) external onlyOwner {
        if (block.timestamp < startTime) revert NotStarted();

        uint256 months = (block.timestamp - startTime) / 30 days;

        if (months <= cliff) revert CliffNotDone();

        uint256 amount = (rate * months * total) / denominator;

        unchecked {
            amount = amount - claimed;
            if (amount == 0) return;

            claimed = claimed + amount;
        }

        paradox.transfer(_recipient, amount);

        emit Claimed(_recipient, amount);
    }

    function pending() external view returns (uint256) {
        if (block.timestamp < startTime) return 0;

        uint256 months = (block.timestamp - startTime) / 30 days;


        if (months <= cliff) return 0;

        uint256 amount = (rate * months * total) / denominator;

        unchecked {
            amount = amount - claimed;
            if (amount == 0) return 0;
        }

        return amount;
    }
}
