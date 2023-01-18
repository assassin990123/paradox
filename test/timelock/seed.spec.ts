import { expect } from "chai";
import { ethers, network } from "hardhat";

describe("Timelock", function () {
  // eslint-disable-next-line no-unused-vars
  let owner: any;
  let recipient: any;
  let timelock: any;
  let paradox: any;
  beforeEach(async function () {
    [owner, recipient] = await ethers.getSigners();

    timelock = await ethers.getContractFactory("ParadoxTimelock");
    paradox = await ethers.getContractFactory("ParadoxToken");
    paradox = await paradox.deploy();
  });
  it("Should work for Seed", async function () {
    // total: 116M
    // 12 month cliff
    // 5% every month
    timelock = await timelock.deploy(
      paradox.address, // paradox
      12, // cliff
      5, // percent per period
      ethers.utils.parseEther("116000000"), // total
      1668686400, // start
      100, // denominator
      30 // period
    );

    await network.provider.send("evm_increaseTime", [12 * 2419200]);
    await network.provider.send("evm_mine");

    await paradox.transfer(
      timelock.address,
      ethers.utils.parseEther("116000000")
    );
    const monthlyBalance = 5800000;

    for (let i = 0; i < 20; i++) {
      await timelock.release(recipient.address);

      expect(await paradox.balanceOf(recipient.address)).to.equal(
        ethers.utils.parseEther((monthlyBalance * (i + 1)).toString())
      );

      const latestBlock = await ethers.provider.getBlock("latest");

      await network.provider.send("evm_setNextBlockTimestamp", [
        latestBlock.timestamp + 2592000,
      ]);
      await network.provider.send("evm_mine");
    }

    await expect(timelock.release(recipient.address)).to.be.revertedWith(
      "ERC20: transfer amount exceeds balance"
    );
  });
});
