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

  it("Should work for Liquidity and MM", async function () {
    // total: 100M
    // 4 month cliff
    // 5% per month
    const latestBlock = await ethers.provider.getBlock("latest");

    timelock = await timelock.deploy(
      paradox.address, // paradox
      4, // cliff
      5, // percent per period
      ethers.utils.parseEther("100000000"), // total
      latestBlock.timestamp + 3600, // start
      100, // denominator
      30 // period
    );
    // General Tests
    expect(await timelock.rate()).to.equal(5);
    expect(await timelock.total()).to.equal(
      ethers.utils.parseEther("100000000")
    );
    expect(await timelock.startTime()).to.equal(latestBlock.timestamp + 3600);
    expect(await timelock.denominator()).to.equal(100);
    expect(await timelock.period()).to.equal(30 * 24 * 60 * 60);

    // should revert if not enough time has passed
    await expect(timelock.release(recipient.address)).to.be.revertedWith(
      "CliffNotDone"
    );

    // should revert if not owner
    await expect(
      timelock.connect(recipient).release(recipient.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    // should revert if cliff isn't finished
    await network.provider.send("evm_increaseTime", [3 * 2419200]);
    await network.provider.send("evm_mine");

    await expect(timelock.release(recipient.address)).to.be.revertedWith(
      "CliffNotDone"
    );

    // should revert if nothing to claim
    // currently set to 1 month after the cliff ends
    await network.provider.send("evm_increaseTime", [2 * 2419200]);
    await network.provider.send("evm_mine");

    await expect(timelock.release(recipient.address)).to.be.revertedWith(
      "ERC20: transfer amount exceeds balance"
    );

    // fifth month onwards, it should work

    await paradox.transfer(
      timelock.address,
      ethers.utils.parseEther("100000000")
    );

    // 5% every month = 20 months to complete
    const monthlyBalance = 5000000;

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

    // now it should revert
    await expect(timelock.release(recipient.address)).to.be.revertedWith(
      "ERC20: transfer amount exceeds balance"
    );
  });
});
