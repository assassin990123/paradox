// SPX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "hardhat/console.sol";

contract ParadoxTimelock is Ownable {
    IERC20 public paradox;

    uint256 public immutable releaseStart;
    uint256 public immutable rate;
    uint256 public immutable total;
    uint256 public immutable startTime;
    uint256 public immutable denominator;
    uint256 public immutable period;

    uint256 public released;

    error NotStarted();
    error CliffNotDone();
    error NothingToClaim();

    event Released(address recipient, uint256 amount);

    /**
        @param _paradox The address of the PARADOX token
        @param _cliff The amount of time in months before the first claim can be made
        @param _rate The amount of tokens to claim per _releaseRate
        @param _total The total amount of claimable tokens
        @param _startTime The time in seconds when the timelock starts
        @param _denominator The denominator used to calculate the amount of tokens to claim
        @param _period The rate of release in days
     */
    constructor(
        address _paradox,
        uint256 _cliff,
        uint256 _rate,
        uint256 _total,
        uint256 _startTime,
        uint256 _denominator,
        uint256 _period
    ) {
        paradox = IERC20(_paradox);
        releaseStart = _startTime + (_cliff * 30 days);
        rate = _rate;
        total = _total;
        startTime = _startTime;
        denominator = _denominator;
        period = _period * 1 days;
    }

    function release(address _recipient) external onlyOwner {
        if (block.timestamp < releaseStart) revert CliffNotDone();
        uint256 months = ((block.timestamp - releaseStart) / period) + 1;
        uint256 amount = rate * months * total / denominator;

        unchecked {
            amount = amount - released;
            if (amount == 0) revert NothingToClaim();

            released = released + amount;
        }

        paradox.transfer(_recipient, amount);

        emit Released(_recipient, amount);
    }

    function pending() external view returns (uint256) {
        if (block.timestamp < releaseStart) return 0;

        uint256 months = ((block.timestamp - startTime) / period) + 1;

        uint256 amount = rate * months * total / denominator;

        unchecked {
            amount = amount - released;
            if (amount == 0) return 0;
        }

        return amount;
    }
}
