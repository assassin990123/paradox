---
label: Staking
icon: graph
order: 2
---

# Staking Protocol
This document outlines the general design considerations for the **Paradox Staking System**. Please see the **Integration** section to learn about the relationships between the staking protocol and others in the ecosystem.

The Staking protocol is inspired by the MasterChef and Hex contracts, rewarding users for staking both *large* amounts of $PARA as well as the *length* of the stake.

## Amount Multiplier
Stakes up **25,000,000** of the total supply of $PARA will be awarded a bonus token allocation given by the following formula:

$$
\displaystyle {bonus = \frac{stake * min(stake , 25M)}{25M}}
$$

## Length Multiplier

The staking protocol will support stakes between 28 and 2888 days. This means that starting at the 28 day threshold, bonus tokens will be alloted given by the following formula:

$$
\displaystyle {bonus = \frac{stake * (days - 28)}{103}}
$$