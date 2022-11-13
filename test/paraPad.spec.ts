import { expect } from "chai";
import { ethers } from "hardhat";

describe("Presale V2 tests", async () => {
  let deployer: any;
  let alice: any;
  let para: any;
  let usdt: any;
  let paraPad: any;

  beforeEach(async function () {
    [deployer, alice] = await ethers.getSigners();

    para = await ethers.getContractFactory("ParadoxToken");
    para = await para.deploy();

    usdt = await ethers.getContractFactory("USDT");
    usdt = await usdt.deploy();

    paraPad = await ethers.getContractFactory("Parapad");
    paraPad = await paraPad.deploy(usdt.address, para.address);

    para.transfer(paraPad.address, ethers.utils.parseEther("100000000"));
    usdt.transfer(alice.address, ethers.utils.parseUnits("1000000", 6));
  });
  it("Buys Paradox at the correct exchange rate", async () => {
    const amount = (Math.random() * (1000 - 0) + 0).toFixed(3);
    const amountPara = (Number(amount) / 0.03) * 0.2;
    console.log(`Amount to buy in USDT: ${amount}`);
    console.log(`Amount to be received in PARA initially: ${amountPara}`);

    await usdt
      .connect(alice)
      .approve(paraPad.address, ethers.utils.parseUnits(amount, 6));

    await paraPad.connect(alice).buyParadox(ethers.utils.parseUnits(amount, 6));

    expect(
      Number(
        ethers.utils.formatEther(await para.balanceOf(alice.address))
      ).toFixed(1)
    ).to.equal(amountPara.toFixed(1));
  });
});
