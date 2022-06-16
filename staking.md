---
label: Staking
icon: graph
order: 2
---

# Staking Protocol
This document outlines the general design considerations for the **Paradox Staking System**. The Staking protocol is inspired by the MasterChef and Hex contracts, rewarding users for staking both *large* amounts of $PARA as well as the *length* of the stake. 

Additionally (and optionally) an amount of the staking pool is distributed daily to active stakers. 

**The longer and more you stake the better your reward.**

---

## Amount Multiplier
Stakes up **25,000,000** of the total supply of $PARA will be awarded a bonus token allocation given by the following formula:

$$
\displaystyle {Reward = \frac{Stake * min(Stake , 25M)}{25M}}
$$

---

## Length Multiplier
The staking protocol will support stakes between 28 and 2888 days. This means that starting at the 28 day threshold, bonus tokens will be allocated given by the following formula:

$$
\displaystyle {Reward = \frac{Stake * (days - 28)}{103} \leq 2* Stake}
$$

Note that the length multiplier increases linearly until the bonus has reached twice as much as the initially staked amount.

---

## Diffusion
The amount of the $PARA pool a user acquires is directly in proportion to how much **P-SAVE** they have in the staking pool, and by extension how much $PARA was staked initially. A static, but variable amount of $PARA is distributed to users per day, and split amongst them using the following formula:

$$
\displaystyle {Reward_d = Share * Amount - Debt}
$$

The debt simply is a way to track a users previous stakes for the system to work. The share is a ratio representing the global allocation of $PARA.

---

## P-Save
When a user stakes $PARA, that stake is distributed throughout the ecosystem.

- [x] 33% is Burned.
- [x] 33% is distributed to the rewards pool.
- [x] 33% is distributed to the staking pool.

These values will all be upgradeable, and there will be an option to turn off burn.

The user is then credited an equivalent amount of the **P-Save** virtual currency, which is the basis for all staking rewards calculations. Essentially, a virtual pool is used to determine a users share in the pool. A users pending rewards are then calculated by the following formula:

$$
\displaystyle {Reward_t = Reward_d + Reward_a + Reward_l}
$$

The function variables are defined below:

Variable   | Description
:---:   | :---:
Reward A | Reward based on the amount staked, defined above.
Reward L | Reward based on the length of the stake, defined above.
Reward D | Reward based on the daily pool distribution.

---

## User Flow 
What follows is an example of two users, **Alice** and **Bob**, who both deposit 10 $PARA stakes for 200 days. This example assumes that the contract has enough funds to cover their stakes. Please see the **Mitigating Risks** section for developer thoughts on that.

Alice and bob will receive a negligible **amount multiplier** but the **length multiplier** bonus will be roughly 1.7 $PARA, or a 17% yield.

Following this, both users have a 50% share of the pot. So, assuming that 1 $PARA is distributed a day, each user will receive 100 PARA.

In total, in this idealized scenario *with only two people*, Alice and Bob experience a 1017% gain over 200 days.

---

## Mitigating Risks
It is entirely possible, without some sort of automated service monitoring the contract, for the staking pool balance to be superceded by a users pending rewards. In this case where the contract can't cover the amount, the contract should be intelligent enough to pause operations until more funds are deposited.

For this reason the developer would recommend making the **$PARA** token inflationary, such that more can be minted in the case that other parts of the ecosystem are not generating enough $PARA flow to the staking contract.

