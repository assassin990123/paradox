import { expect } from "chai";
import { ethers, network } from "hardhat";

describe("Timelock", function () {
  let owner;
  let timelock;
  beforeEach(async function () {
    const [owner] = await ethers.getSigners();

    timelock = await ethers.getContractFactory("ParadoxTimelock");
    timelock = await timelock.deploy();
    await timelock.deploy();
  });

  it("Should work for Liquidity and MM", async function () {
    // 4 month cliff
    // 5% per month
  });
  it("Should work for Marketing", async function () {
    // 1 year cliff
    // 5% per month
  });
  it("Should work for P2E", async function () {
    // 3 month cliff
    // 2% per month
  });
  it("Should work for staking", async function () {
    // 3 month cliff
    // 2% per month
  });
  it("Should work for RND", async function () {
    // 6 month cliff
    // 5.55% every 3 months
  });
  it("Should work for Ecosystem", async function () {
    // 6 month cliff
    // 5.55% every 3 months
  });
  it("Should work for Advisors", async function () {
    // 12 month cliff
    // 5.55% every 3 months
  });
});
