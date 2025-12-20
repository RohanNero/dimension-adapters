import { METRIC } from "../../helpers/metrics";
import { lagoonExports } from "../../helpers/lagoon";
import { CHAIN } from "../../helpers/chains";

// docs: https://docs.lagoon.finance/vault/fees
// Lagoon allows curators to deploy vaults - where users can deposit and earn yields
// curators can config and share of yield from performance and management fees
// on top of that, Lagoon can earn up to 30% of those fees as protocol revenue 
export default {
  ...lagoonExports({
    [CHAIN.ETHEREUM]: {
      feeRegistry: '0x6dA4D1859bA1d02D095D2246142CdAd52233e27C',
      factories: [
        { address: '0x8D6f5479B14348186faE9BC7E636e947c260f9B1', fromBlock: 22940919 }, // optinProxyFactory
        { address: '0x09C8803f7Dc251f9FaAE5f56E3B91f8A6d0b70ee', fromBlock: 22218451 }, // beaconFactory
      ],
      vaults: [
        '0x07ed467acD4ffd13023046968b0859781cb90D9B', // 9Summits Flagship ETH
        '0x03D1eC0D01b659b89a87eAbb56e4AF5Cb6e14BFc', // 9Summits Flagship USDC
        '0xB09F761Cb13baCa8eC087Ac476647361b6314F98', // 9Summits & Tulipa Capital cbBTC
        '0x8092cA384D44260ea4feaf7457B629B8DC6f88F0', // Usual Invested USD0++ in stUSR
        '0x66dCB62da5430D800a1c807822C25be17138fDA8', // Unity Trust
        '0x71652D4898DE9A7DD35e472a5fe4577eC69d82f2', // Trinity Trust
        '0x7895a046b26cc07272b022a0c9bafc046e6f6396', // Noon tacUSN
        '0x8245FD9Ae99A482dFe76576dd4298f799c041D61', // Usual Invested USD0++ in USCC & USTB
        '0xaf87b90e8a3035905697e07bb813d2d59d2b0951', // Usual Invested USD0++ in TAC
      ],
    },
    [CHAIN.ARBITRUM]: {
      feeRegistry: '0x6dA4D1859bA1d02D095D2246142CdAd52233e27C',
      factories: [
        { address: '0x9De724B0efEe0FbA07FE21a16B9Bf9bBb5204Fb4', fromBlock: 358686643 },
        { address: '0x58a7729125acA9e5E9C687018E66bfDd5b2D4490', fromBlock: 324144504 },
      ],
      vaults: ['0x99CD0b8b32B15922f0754Fddc21323b5278c5261'],
    },
    [CHAIN.AVAX]: {
      feeRegistry: '0xD7F69ba99c6981Eab5579Aa16871Ae94c509d578',
      factories: [
        { address: '0xC094C224ce0406BC338E00837B96aD2e265F7287', fromBlock: 65620725 },
        { address: '0x5E231C6D030a5c0f51Fa7D0F891d3f50A928C685', fromBlock: 62519141 },
      ],
    },
    [CHAIN.BASE]: {
      feeRegistry: '0x6dA4D1859bA1d02D095D2246142CdAd52233e27C',
      factories: [
        { address: '0x6FC0F2320483fa03FBFdF626DDbAE2CC4B112b51', fromBlock: 32988756 },
        { address: '0xC953Fd298FdfA8Ed0D38ee73772D3e21Bf19c61b', fromBlock: 29100401 },
      ],
      vaults: [
        "0xFCE2064B4221C54651B21c868064a23695E78f09", // 722Capital-ETH
        "0x8092cA384D44260ea4feaf7457B629B8DC6f88F0", // DeTrade Core USDC
        "0xB09F761Cb13baCa8eC087Ac476647361b6314F98", // 722Capital-USDC
      ],
    },
    [CHAIN.LINEA]: {
      feeRegistry: '0xC81Dd51239119Db80D5a6E1B7347F3C3BC8674d9',
      factories: [
        { address: '0x8D6f5479B14348186faE9BC7E636e947c260f9B1', fromBlock: 23119208 },
      ],
    },
    [CHAIN.MONAD]: {
      feeRegistry: '0xBf994c358f939011595AB4216AC005147863f9D6',
      factories: [
        { address: '0xcCdC4d06cA12A29C47D5d105fED59a6D07E9cf70', fromBlock: 36249718 },
      ],
    },
  }),
  methodology: {
    Fees: 'Total yield generated from supplied assets.',
    Revenue: 'Amount of performance and management fees to vault deployers and Lagoon protocol.',
    SupplySideRevenue: 'Amount of yields distributed to vault suppliers.',
    ProtocolRevenue: 'Portion of performance and management fees collected by Lagoon protocol (rate varies by vault).',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.ASSETS_YIELDS]: 'Amount of yields after performance and management fees cut.',
      [METRIC.MANAGEMENT_FEES]: 'Management fees share to vault deployers and Lagoon protocol.',
      [METRIC.PERFORMANCE_FEES]: 'Performance fees share to vault deployers and Lagoon protocol.',
    },
    Revenue: {
      [METRIC.MANAGEMENT_FEES]: 'Management fees share to vault deployers and Lagoon protocol.',
      [METRIC.PERFORMANCE_FEES]: 'Performance fees share to vault deployers and Lagoon protocol.',
    },
    ProtocolRevenue: {
      [METRIC.MANAGEMENT_FEES]: 'Protocol share of management fees.',
      [METRIC.PERFORMANCE_FEES]: 'Protocol share of performance fees.',
    },
    SupplySideRevenue: {
      [METRIC.ASSETS_YIELDS]: 'Amount of yields after performance and management fees cut to suppliers.',
    },
  }
};
