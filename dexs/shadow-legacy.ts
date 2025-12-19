
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addOneToken } from "../helpers/prices";
import { fetchPoolsRevenue } from "./shadow-exchange"

const voter = "0x9f59398d0a397b2eeb8a6123a6c7295cb0b0062d";

const PROTOCOL_FEE_SHARE = 0.05; // 5% to protocol
const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyVolume = options.createBalances();

  const stats = await fetchPoolsRevenue(options);

  const pairLogs = await options.getLogs({
    target: "0x2dA25E7446A70D7be65fd4c053948BEcAA6374c8",
    eventAbi: "event PairCreated(address indexed token0,address indexed token1,address pair,uint256)",
    fromBlock: 4028276,
    toBlock: await options.getToBlock()
  })

  const pairAddresses = pairLogs.map(p => p.pair.toLowerCase());

  const [fees, gauges] = await Promise.all([
    options.api.multiCall({
      abi: "function fee() view returns (uint256)",
      calls: pairAddresses,
    }),
    options.api.multiCall({
      abi: "function gaugeForPool(address pool) view returns (address)",
      calls: pairAddresses.map(p => ({ target: voter, params: [p] })),
      permitFailure: true,
    }),
  ]);

  const pairData: Record<string, { token0: string; token1: string; fee: number; hasGauge: boolean; }> = {};
  pairLogs.forEach((log, i) => {
    const hasGauge = gauges[i] && gauges[i] !== "0x0000000000000000000000000000000000000000";
    pairData[log.pair.toLowerCase()] = {
      token0: log.token0,
      token1: log.token1,
      fee: Number(fees[i] > 0n ? fees[i] / 1e6 : 0n),
      hasGauge
    };
  });

  const swapLogs = await options.getLogs({
    targets: pairAddresses,
    onlyArgs: false,
    eventAbi: "event Swap(address indexed sender,uint256 amount0In,uint256 amount1In,uint256 amount0Out,uint256 amount1Out,address indexed to)",
  });

  for (const log of swapLogs) {
    const pair = pairData[log.address.toLowerCase()];
    if (!pair) continue;
    const { token0, token1, fee, hasGauge } = pair;

    const volume0 = log.args.amount0In > 0n ? log.args.amount0In : log.args.amount0Out;
    const volume1 = log.args.amount1In > 0n ? log.args.amount1In : log.args.amount1Out;
    addOneToken({ chain: CHAIN.SONIC, balances: dailyVolume, token0, token1, amount0: volume0, amount1: volume1 });

    const fees0 = BigInt(Math.floor(Number(volume0) * fee));
    const fees1 = BigInt(Math.floor(Number(volume1) * fee));
    addOneToken({ chain: CHAIN.SONIC, balances: dailyFees, token0, token1, amount0: fees0, amount1: fees1 });

    if (!hasGauge) {
      const protocolFees0 = BigInt(Math.floor(Number(fees0) * PROTOCOL_FEE_SHARE));
      const protocolFees1 = BigInt(Math.floor(Number(fees1) * PROTOCOL_FEE_SHARE));
      addOneToken({ chain: CHAIN.SONIC, balances: dailyRevenue, token0, token1, amount0: protocolFees0, amount1: protocolFees1 });
      addOneToken({ chain: CHAIN.SONIC, balances: dailySupplySideRevenue, token0, token1, amount0: fees0 - protocolFees0, amount1: fees1 - protocolFees1 });
    }
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: stats.legacyFeesDistributed,
    dailyBribesRevenue: stats.legacyBribesRevenue,
    dailyVolume,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SONIC]: {
      fetch,
      start: "2025-01-15",
    },
  },
  methodology: {
    Volume: "Total volume of from Swap events on legacy pairs.",
    UserFees: "All swap fees paid by users.",
    Fees: "A variable fee is charged on each swap, depending on the pair.",
    Revenue: "5% of collected fees go to the treasury.",
    HoldersRevenue: "Pools with gauges distribute swap fees to holders.",
    BribesRevenue: "Bribe revenue is distributed to holders.",
    ProtocolRevenue: "5% of swap fees go to the treasury for pairs without a gauge.",
    SupplySideRevenue: "95% of collected fees are distributed to LPs for pairs without a gauge.",
  }
}

export default adapter;