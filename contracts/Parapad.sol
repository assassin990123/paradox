// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";


contract Parapad is Ownable {
    using SafeERC20 for IERC20; 

    address public usdtAddress;
    address public paradoxAddress;

    IERC20 internal para;
    IERC20 internal usdt;

    mapping(address => bool) public _claimed;

    bytes32 public root;

    uint256 constant internal MINT_SUPPLY = 12500000 * PARADOX_DECIMALS;

    uint256 constant internal PARADOX_DECIMALS = 10 ** 18;
    uint256 constant internal USDT_DECIMALS = 10 ** 6;
    
    uint256 constant internal EXCHANGE_RATE = 3;
    uint256 constant internal EXCHANGE_RATE_DENOMINATOR = 100;

    uint256 constant internal MONTH = 4 weeks;

    mapping(address => Lock) public locks;

    struct Lock {
        uint256 total;
        uint256 max;
        uint256 paid;
        uint256 debt;
        uint256 startTime;
    }

    constructor (address _usdt, address _paradox, bytes32 _root) {
        usdtAddress = _usdt;
        usdt = IERC20(_usdt);

        paradoxAddress = _paradox;
        para = IERC20(_paradox);

        root = _root;
    }

    function getClaimed(address _user) external view returns (bool) {
        return _claimed[_user];
    }

    function claimParadox(
        address destination,
        uint256 amount,
        uint256 buyAmount,
        bytes32[] calldata merkleProof
    ) external {
        require(canClaim(destination, amount, merkleProof), "Invalid Claim");
        uint256 maxUSD = 1000 * amount * USDT_DECIMALS;
        require(buyAmount <= maxUSD, "Wrong amount");

        // get exchange rate to para
        uint256 rate = buyAmount * EXCHANGE_RATE_DENOMINATOR * PARADOX_DECIMALS / (USDT_DECIMALS * EXCHANGE_RATE);
        require(rate <= para.balanceOf(address(this)), "Low balance");
        // give user 20% now
        uint256 rateNow = rate * 20 / 100;
        uint256 vestingRate = rate - rateNow;

        if (locks[destination].total == 0) {
            // new claim
            locks[destination] = Lock({
                total: vestingRate,
                max: maxUSD,
                paid: buyAmount,
                debt: 0,
                startTime: block.timestamp
            });

            if (buyAmount == maxUSD) _claimed[destination] = true;
        } else {
            // at this point, the user still has some pending amount they can claim
            require(buyAmount + locks[destination].paid <= locks[destination].max, "Too Much");

            locks[destination].total += vestingRate;
            if (buyAmount + locks[destination].paid == locks[destination].max) _claimed[destination] = true;
            locks[destination].paid += buyAmount;
        }

        usdt.safeTransferFrom(destination, address(this), buyAmount);
        para.safeTransfer(destination, rateNow);
    }

    /**
     * @dev helper for validating if an address has PARA to claim
     * @return true if claimant has not already claimed and the data is valid, false otherwise
     */
    function canClaim(
        address destination,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) public view returns (bool) {
        bytes32 node = keccak256(abi.encodePacked(destination, amount));
        return
            !_claimed[destination] &&
            MerkleProof.verify(merkleProof, root, node);
    }

    // New Function
    function pendingVestedParadox(address _user) external view returns(uint256) {
        Lock memory userLock = locks[_user];

        uint256 monthsPassed = (block.timestamp - userLock.startTime) / 4 weeks;
        /** @notice 5% released each MONTH after 2 MONTHs */ 
        uint256 monthlyRelease = userLock.total * 2 / 10;

        uint256 release;
        for (uint256 i = 0; i < monthsPassed; i++) {
            if (i >= 2) {
                if (release == userLock.total) break;
                release += monthlyRelease;
            }
        }

        return release - userLock.debt;
    }
 
    // New Function
    function claimVestedParadox() external {
        Lock storage userLock = locks[msg.sender];
        require(userLock.total == userLock.debt, "Vesting Complete");

        uint256 monthsPassed = (block.timestamp - userLock.startTime) / 4 weeks;
        /** @notice 5% released each MONTH after 2 MONTHs */
        uint256 monthlyRelease = userLock.total * 2 / 10;

        uint256 release;
        for (uint256 i = 0; i < monthsPassed; i++) {
            if (i >= 2) {
                if (release == userLock.total) break;
                release += monthlyRelease;
            }
        }

        uint256 reward = release - userLock.debt;
        userLock.debt += reward;
        para.safeTransfer(msg.sender, reward);
    }

    function updateRoot(bytes32 _root) external onlyOwner{
        root = _root;
    }

    function withdrawTether() external onlyOwner {
        usdt.safeTransfer(msg.sender, usdt.balanceOf(address(this)));
    }


    /** @notice EMERGENCY FUNCTIONS */

    function updateClaimed(address _user) external onlyOwner {
        _claimed[_user] = !_claimed[_user];
    }

    function updateUserLock(address _user, uint256 _total, uint256 _max, uint256 _paid, uint256 _startTime) external onlyOwner {
        Lock storage lock = locks[_user];
        lock.total = _total;
        lock.max = _max;
        lock.paid = _paid;
        lock.startTime = _startTime;
    }
    
    function withdrawETH() external onlyOwner {
        address payable to = payable(msg.sender);
        to.transfer(address(this).balance);
    }

    function withdrawParadox() external onlyOwner {
        para.safeTransfer(msg.sender, para.balanceOf(address(this)));
    }

}
