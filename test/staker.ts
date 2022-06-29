import { expect } from "chai";
import { ethers } from "hardhat";

describe("Staker", function () {
  beforeEach(async () => {
    
  });

  describe("Start Stake", async () => {
    it("Should have lenght more than 28 days.", async () => {});
    it("Should have lenght less than 2888 days.", async () => {});
    it("Should have precalculated stakeshare.", async () => {});
  });

  describe("End Stake", async () => {
    it("Should return staked Para and rewards based on the stakeshare.", async () => {});
    it("Should apply penalty before 28 days", async () => {});
  });

  describe("Stake overview", async () => {
    it("Alice, Bob and Charlie each stake 100,000 PARA for 100 days.", async () => {});
    it("Alice, Bob and Charlie each stake 100,000 PARA for 100 days, Bob end stake 50 days after.", async () => {});
    it("Alice, Bob and Charlie each stake 100,000 PARA for 100 days, Charlie add stake 100,000 PARA 50 days after the first stake", async () => {});
  });
});
