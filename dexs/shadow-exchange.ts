import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Balances } from "@defillama/sdk";
import { addOneToken } from "../helpers/prices";

const voter = "0x9f59398d0a397b2eeb8a6123a6c7295cb0b0062d";
const XSHADOW_CONTRACT = "0x5050bc082FF4A74Fb6B0B04385dEfdDB114b2424";
const SHADOW_TOKEN = "0x3333b97138d4b086720b5ae8a7844b1345a33333";

// 50% penalty on instant exits from xShadow
const fetchXShadowPenalties = async (options: FetchOptions) => {
  const penalties = options.createBalances();
  const instantExitLogs = await options.getLogs({
    target: XSHADOW_CONTRACT,
    eventAbi: "event InstantExit(address indexed user, uint256 amount)",
  });

  for (const log of instantExitLogs) {
    // add amounts directly since 50% penalty
    penalties.add(SHADOW_TOKEN, log.amount);
  }
  return penalties;
};

// Voter events
const gaugeCreatedAbi = "event GaugeCreated (address indexed gauge, address creator, address feeDistributor, address indexed pool)";
// FeeDistributor events
const notifyRewardAbi = "event NotifyReward (address indexed from, address indexed reward, uint256 amount, uint256 period)";
const votesIncentivizedAbi = "event VotesIncentivized(address indexed from,address indexed reward,uint256 amount,uint256 period)";

interface FeeDistributionInfo {
  legacyBribesRevenue?: Balances;
  clBribesRevenue?: Balances;
  legacyFeesDistributed?: Balances;
  clFeesDistributed?: Balances;
}

// Fetch revenue from fee distribution to holders and voting bribes
const fetchPoolsRevenue = async (options: FetchOptions): Promise<FeeDistributionInfo> => {
  const legacyBribesRevenue = options.createBalances();
  const clBribesRevenue = options.createBalances();
  const legacyFeesDistributed = options.createBalances();
  const clFeesDistributed = options.createBalances();

  const gaugeCreatedLogs = await options.getLogs({
    target: voter,
    eventAbi: gaugeCreatedAbi,
    fromBlock: 10266222,
  });

  if (gaugeCreatedLogs.length === 0) {
    return { legacyBribesRevenue, clBribesRevenue, legacyFeesDistributed, clFeesDistributed };
  }

  const feeDistributors = gaugeCreatedLogs.map(log => log.feeDistributor);

  // identify if each gauge is legacy or CL
  const [isLegacyResults, isClResults] = await Promise.all([
    options.api.multiCall({
      abi: "function isLegacyGauge(address gauge) view returns (bool)",
      calls: gaugeCreatedLogs.map(log => ({ target: voter, params: [log.gauge] })),
      permitFailure: true,
    }),
    options.api.multiCall({
      abi: "function isClGauge(address gauge) view returns (bool)",
      calls: gaugeCreatedLogs.map(log => ({ target: voter, params: [log.gauge] })),
      permitFailure: true,
    }),
  ]);

  const legacyFeeDistributors: string[] = [];
  const clFeeDistributors: string[] = [];
  feeDistributors.forEach((feeDistributor, i) => {
    const isLegacy = isLegacyResults[i] || false;
    const isCL = isClResults[i] || false;
    if (isLegacy) {
      legacyFeeDistributors.push(feeDistributor.toLowerCase());
    } else if (isCL) {
      clFeeDistributors.push(feeDistributor.toLowerCase());
    }
  });

  const [legacyNotifyRewardLogs, clNotifyRewardLogs] = await Promise.all([
    legacyFeeDistributors.length > 0
      ? options.getLogs({
        targets: legacyFeeDistributors,
        eventAbi: notifyRewardAbi,
      })
      : Promise.resolve([]),
    clFeeDistributors.length > 0
      ? options.getLogs({
        targets: clFeeDistributors,
        eventAbi: notifyRewardAbi,
      })
      : Promise.resolve([]),
  ]);

  const [legacyBribeLogs, clBribeLogs] = await Promise.all([
    legacyFeeDistributors.length > 0
      ? options.getLogs({
        targets: legacyFeeDistributors,
        eventAbi: votesIncentivizedAbi,
      })
      : Promise.resolve([]),
    clFeeDistributors.length > 0
      ? options.getLogs({
        targets: clFeeDistributors,
        eventAbi: votesIncentivizedAbi,
      })
      : Promise.resolve([]),
  ]);

  for (const log of legacyNotifyRewardLogs) {
    legacyFeesDistributed.add(log.reward, log.amount);
  }

  for (const log of clNotifyRewardLogs) {
    clFeesDistributed.add(log.reward, log.amount);
  }

  for (const log of legacyBribeLogs) {
    legacyBribesRevenue.add(log.reward, log.amount);
  }

  for (const log of clBribeLogs) {
    clBribesRevenue.add(log.reward, log.amount);
  }

  return { legacyBribesRevenue, clBribesRevenue, legacyFeesDistributed, clFeesDistributed };
}

const protocolFeeRate = 0.05; // 5% protocol fee
const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyVolume = options.createBalances();

  // Get xShadow penalties (token tax)
  const xShadowPenalties = await fetchXShadowPenalties(options);
  dailyFees.addBalances(xShadowPenalties);

  // Get CL pool revenue from gauges (holders revenue)
  const stats = await fetchPoolsRevenue(options);

  const poolCreatedLogs = await options.getLogs({
    target: "0xcD2d0637c94fe77C2896BbCBB174cefFb08DE6d7", // ShadowV3Factory
    eventAbi: "event PoolCreated(address indexed token0,address indexed token1,uint24 indexed fee,int24 tickSpacing,address pool)",
    fromBlock: 1705781,
  });

  const poolAddresses = poolCreatedLogs.map(log => log.pool.toLowerCase());
  const poolData: Record<string, { token0: string; token1: string; fee: number; hasGauge: boolean }> = {};

  // Check which pools have gauges
  const gauges = await options.api.multiCall({
    abi: "function gaugeForPool(address pool) view returns (address)",
    calls: poolAddresses.map(p => ({ target: voter, params: [p] })),
    permitFailure: true,
  });

  poolCreatedLogs.forEach((log, i) => {
    const hasGauge = gauges[i] && gauges[i] !== "0x0000000000000000000000000000000000000000";
    poolData[log.pool.toLowerCase()] = {
      token0: log.token0,
      token1: log.token1,
      fee: Number(log.fee) / 1e6,
      hasGauge,
    };
  });

  const swapLogs = await options.getLogs({
    targets: poolAddresses,
    onlyArgs: false,
    eventAbi: "event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)",
  });

  for (const log of swapLogs) {
    const pool = poolData[log.address.toLowerCase()];
    if (!pool) continue;
    const { token0, token1, fee, hasGauge } = pool;

    const volume0 = log.args.amount0 > 0n ? log.args.amount0 : -log.args.amount0;
    const volume1 = log.args.amount1 > 0n ? log.args.amount1 : -log.args.amount1;
    addOneToken({ chain: CHAIN.SONIC, balances: dailyVolume, token0, token1, amount0: volume0, amount1: volume1 });

    const fees0 = BigInt(Math.floor(Number(volume0) * fee));
    const fees1 = BigInt(Math.floor(Number(volume1) * fee));
    addOneToken({ chain: CHAIN.SONIC, balances: dailyFees, token0, token1, amount0: fees0, amount1: fees1 });

    if (!hasGauge) {
      const protocolFees0 = BigInt(Math.floor(Number(fees0) * protocolFeeRate));
      const protocolFees1 = BigInt(Math.floor(Number(fees1) * protocolFeeRate));

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
    dailyHoldersRevenue: stats.clFeesDistributed,
    dailyBribesRevenue: stats.clBribesRevenue,
    dailyVolume,
    dailyTokenTaxes: xShadowPenalties,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SONIC]: {
      fetch,
      start: "2025-01-15",
    },
  },
  methodology: {
    Volume: "Total volume from Swap events on CL pools.",
    UserFees: "All swap fees paid by users.",
    Fees: "A variable fee is charged on each swap, depending on the pool.",
    Revenue: "Protocol receives 5% of fees from pools without a gauge.",
    HoldersRevenue: "Fees from gauged pools distributed to holders via FeeDistributor.",
    BribesRevenue: "Bribe revenue is distributed to holders.",
    ProtocolRevenue: "5% of fees from pools without a gauge.",
    SupplySideRevenue: "95% of fees from pools without a gauge go to LPs.",
    TokenTax: "50% penalty on instant exits from xShadow.",
  },
};

export { fetchPoolsRevenue };
export default adapter;