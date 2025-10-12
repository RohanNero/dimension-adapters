


import { SimpleAdapter, FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

const withdrawABI = "event FundsWithdrawn(address indexed fromAccount, address tokenAddress, uint256 amountWithFee, uint256 feeAmount,address beneficiary)";
const collateralVault = "0x5d2725fdE4d7Aa3388DA4519ac0449Cc031d675f"

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();

    const withdrawLogs = await options.getLogs({
        target: collateralVault,
        eventAbi: withdrawABI,
        fromBlock: await options.getFromBlock(),
        toBlock: await options.getToBlock(),
    })

    for (const log of withdrawLogs) {
        dailyFees.add(log.tokenAddress, log.feeAmount);
    }
    return { dailyFees, dailyRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch: fetch,
            start: "Aug-19-2024"
        },
    }
}

export default adapter