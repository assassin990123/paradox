import { expect } from "chai";
import { ethers, network } from "hardhat";

describe("Presale V2 tests", async () => {
  let deployer: any;
  let alice: any;
  let bob: any;
  let charlie: any;
  let para: any;
  let usdt: any;
  let paraPad: any;

  beforeEach(async function () {
    [deployer, alice, bob, charlie] = await ethers.getSigners();

    para = await ethers.getContractFactory("ParadoxToken");
    para = await para.deploy();

    usdt = await ethers.getContractFactory("USDT");
    usdt = await usdt.deploy();

    paraPad = await ethers.getContractFactory("Parapad");
    paraPad = await paraPad.deploy(usdt.address, para.address);

    para.transfer(paraPad.address, ethers.utils.parseEther("100000000"));
    usdt.transfer(alice.address, ethers.utils.parseUnits("1000000", 6));
    usdt.transfer(bob.address, ethers.utils.parseUnits("1000000", 6));
  });
  it("Buys Paradox at the correct exchange rate", async () => {
    const amount = (Math.random() * (1000 - 0) + 0).toFixed(3);
    const amountPara = Number(amount) / 0.03;
    const amountParaNow = (Number(amount) / 0.03) * 0.2;
    /*
    console.log(`Amount to buy in USDT: ${amount}`);
    console.log(`Amount to be received in PARA initially: ${amountParaNow}`);
    console.log(`Amount to be received in PARA total: ${amountPara}`);
    */

    await usdt
      .connect(alice)
      .approve(paraPad.address, ethers.utils.parseUnits(amount, 6));

    await paraPad.connect(alice).buyParadox(ethers.utils.parseUnits(amount, 6));

    expect(
      Number(
        ethers.utils.formatEther(await para.balanceOf(alice.address))
      ).toFixed(1)
    ).to.equal(amountParaNow.toFixed(1));

    const lock = await paraPad.locks(alice.address);
    expect(Number(ethers.utils.formatEther(lock.total)).toFixed(1)).to.equal(
      (amountPara - amountParaNow).toFixed(1)
    );
    expect(Number(ethers.utils.formatUnits(lock.paid, 6)).toFixed(1)).to.equal(
      Number(amount).toFixed(1)
    );
    expect(lock.debt).to.equal(0);
  });
  it("Buys only up to $1000 of Para", async () => {
    const amount = "999";

    await usdt
      .connect(alice)
      .approve(paraPad.address, ethers.utils.parseUnits("1000000", 6));

    await usdt
      .connect(bob)
      .approve(paraPad.address, ethers.utils.parseUnits("1000000", 6));

    await paraPad.connect(alice).buyParadox(ethers.utils.parseUnits(amount, 6));

    await expect(
      paraPad.connect(alice).buyParadox(ethers.utils.parseUnits("10", 6))
    ).to.be.revertedWith("Too Much");

    await paraPad.connect(alice).buyParadox(ethers.utils.parseUnits("1", 6));

    await expect(
      paraPad.connect(alice).buyParadox(ethers.utils.parseUnits("1", 6))
    ).to.be.revertedWith("Limit reached");

    await expect(
      paraPad.connect(bob).buyParadox(ethers.utils.parseUnits("1001", 6))
    ).to.be.revertedWith("Wrong amount");

    await paraPad.connect(bob).buyParadox(ethers.utils.parseUnits("1000", 6));

    expect(
      ethers.utils.formatUnits(await usdt.balanceOf(paraPad.address), 6)
    ).to.equal("2000.0");

    await paraPad.withdrawTether(charlie.address);

    expect(
      ethers.utils.formatUnits(await usdt.balanceOf(charlie.address), 6)
    ).to.equal("2000.0");
  });
  it("Should be able to claim 5% monthly after 2 months", async () => {
    const amount = (Math.random() * (1000 - 0) + 0).toFixed(3);

    await usdt
      .connect(alice)
      .approve(paraPad.address, ethers.utils.parseUnits(amount, 6));

    await paraPad.connect(alice).buyParadox(ethers.utils.parseUnits(amount, 6));

    const aliceBalance = Number(
      ethers.utils.formatEther(await para.balanceOf(alice.address))
    );
    let lock = await paraPad.locks(alice.address);
    const t = Number(ethers.utils.formatEther(lock.total));
    const vested = (t * 5) / 100;

    expect(await paraPad.pendingVestedParadox(alice.address)).to.equal("0");

    // +1 month
    await network.provider.send("evm_increaseTime", [2419200]);
    await network.provider.send("evm_mine");

    expect(await paraPad.pendingVestedParadox(alice.address)).to.equal("0");

    // +1 month
    await network.provider.send("evm_increaseTime", [2419200]);
    await network.provider.send("evm_mine");

    expect(await paraPad.pendingVestedParadox(alice.address)).to.equal("0");

    // +1 month
    await network.provider.send("evm_increaseTime", [2419200]);
    await network.provider.send("evm_mine");

    expect(
      Number(
        ethers.utils.formatEther(
          await paraPad.pendingVestedParadox(alice.address)
        )
      ).toFixed(0)
    ).to.equal(vested.toFixed(0));

    await paraPad.connect(alice).claimVestedParadox();

    lock = await paraPad.locks(alice.address);
    expect(Number(ethers.utils.formatEther(lock.debt)).toFixed(0)).to.equal(
      vested.toFixed(0)
    );

    expect(
      Number(
        ethers.utils.formatEther(await para.balanceOf(alice.address))
      ).toFixed(0)
    ).to.equal((vested + aliceBalance).toFixed(0));

    // +2 month

    await network.provider.send("evm_increaseTime", [2 * 2419200]);
    await network.provider.send("evm_mine");

    expect(
      Number(
        ethers.utils.formatEther(
          await paraPad.pendingVestedParadox(alice.address)
        )
      ).toFixed(0)
    ).to.equal((vested * 2).toFixed(0));

    await paraPad.connect(alice).claimVestedParadox();

    lock = await paraPad.locks(alice.address);
    expect(Number(ethers.utils.formatEther(lock.debt)).toFixed(0)).to.equal(
      (vested * 3).toFixed(0)
    );

    // fast forward to many, many months later
    await network.provider.send("evm_increaseTime", [200 * 2419200]);
    await network.provider.send("evm_mine");

    // at this point, we should only be able to claim the total amount
    await paraPad.connect(alice).claimVestedParadox();
    lock = await paraPad.locks(alice.address);

    expect(Number(ethers.utils.formatEther(lock.debt)).toFixed(0)).to.equal(
      Number(ethers.utils.formatEther(lock.total)).toFixed(0)
    );

    expect(
      Number(
        ethers.utils.formatEther(await para.balanceOf(alice.address))
      ).toFixed(0)
    ).to.equal(
      (Number(ethers.utils.formatEther(lock.total)) + aliceBalance).toFixed(0)
    );

    expect(
      ethers.utils.formatEther(
        await paraPad.pendingVestedParadox(alice.address)
      )
    ).to.equal("0.0");

    await expect(paraPad.claimVestedParadox()).to.be.revertedWith(
      "Vesting Complete"
    );
  });
});
