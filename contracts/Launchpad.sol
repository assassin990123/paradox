// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Launchpad is Ownable {
    // Ethereum network paradox token address
    address public paradoxAddress;
    // Paradox token ERC20 interface
    IERC20 internal para;
    // tracking for whitelisted users claim status
    mapping(address => bool) internal _claimed;
    // final merkle hash in merkle tree
    bytes32 public root;
    // paradox token buffer
    uint256 constant internal PARADOX_DECIMALS = 10 ** 18;
    // tracking for whitelisted user vesting data
    mapping(address => Lock) public locks;
    // vesting data definition
    struct Lock {
        uint256 total;
        uint256 debt;
        uint256 startTime;
    }

    constructor(address _para, bytes32 _root) {
        paradoxAddress = _para;
        para = IERC20(paradoxAddress);

        root = _root;
    }

    /** WHITELIST VERIFICATION */
    function canClaim(
        address destination,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) public view returns (bool) {
        bytes32 node = keccak256(bytes.concat(keccak256(abi.encode(destination, amount))));
        return
            !_claimed[destination] &&
            MerkleProof.verify(merkleProof, root, node);
    }

    function claimParadox(
        address destination,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) external {
        require(canClaim(destination, amount, merkleProof), "Invalid Claim");

        _claimed[destination] = true;

        // give user 20% now
        uint256  amountNow = amount * 20 / 100;
        uint256 vestingRate = amount - amountNow;

        locks[destination] = Lock({
            total: vestingRate,
            debt: 0,
            startTime: block.timestamp
        });

        para.transfer(destination, amount);
    }

    function claimVestedParadox() external {
        Lock storage userLock = locks[msg.sender];
        require(userLock.total > userLock.debt, "Vesting Complete");

        uint256 monthsPassed = (block.timestamp - userLock.startTime) / 4 weeks;
        /** @notice 5% released each month after 2 months */
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

        para.transfer(msg.sender, reward);
    }

    function pendingVestedParadox(address _user) external view returns(uint256) {
        Lock memory userLock = locks[_user];

        uint256 monthsPassed = (block.timestamp - userLock.startTime) / 4 weeks;
        /** @notice 5% released each month after 2 months */
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

    /** @notice EMERGENCY FUNCTIONS */

    function updateRoot(bytes32 _root) external onlyOwner{
        root = _root;
    }

    function updateClaimed(address _user) external onlyOwner {
        _claimed[_user] = !_claimed[_user];
    }

    function updateUserLock(address _user, uint256 _total, uint256 _debt, uint256 _startTime) external onlyOwner {
        Lock storage lock = locks[_user];
        lock.total = _total;
        lock.debt = _debt;
        lock.startTime = _startTime;
    }

    function withdrawParadox(address _token) external onlyOwner {
        IERC20(_token).transfer(msg.sender, para.balanceOf(address(this)));
    }

    function withdrawETH() external onlyOwner {
        address payable to = payable(msg.sender);
        to.transfer(address(this).balance);
    }
}
