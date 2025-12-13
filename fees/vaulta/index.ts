import { SimpleAdapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const vaulta_base_url = "https://eos.hyperion.eosrio.io/v2/history/get_actions?account=eosio.fees&filter=eosio.token:transfer&transfer.to=";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const startTime = options.startTimestamp;
    const endTime = startTime + 86400;
    const startDate = new Date(startTime * 1000).toISOString();
    const endDate = new Date(endTime * 1000).toISOString();

    let totalFees = 0;
    let hasMore = true;
    let skip = 0;
    const limit = 1000;
    // Fetch any -> eosio.fees transfers
    while (hasMore) {
        const url = `${vaulta_base_url}eosio.fees&after=${startDate}&before=${endDate}&limit=${limit}&skip=${skip}`;
        const response: any = await fetchURL(url);
        if (response?.actions && response.actions.length > 0) {
            for (const action of response.actions) {
                totalFees += action.act.data.amount;
            }
            if (response.actions.length === limit) {
                skip += limit;
            } else {
                hasMore = false;
            }
        }

    }
    if (totalFees > 0) {
        dailyFees.addCGToken("eos", totalFees);
        dailyRevenue.addCGToken("eos", totalFees);
    }

    // Fetch fees -> bpay transfers
    const bpayUrl = `${vaulta_base_url}eosio.bpay&after=${startDate}&before=${endDate}&limit=${limit}`;
    const bpayResponse: any = await fetchURL(bpayUrl);
    let bpayTotal = 0
    console.log("bpayResponse", bpayResponse.actions.length);
    if (bpayResponse?.actions && bpayResponse.actions.length > 0) {
        for (const action of bpayResponse.actions) {
            const amount = action.act.data.amount;
            bpayTotal += amount;
        }
        dailyRevenue.addCGToken("eos", -bpayTotal);
    }

    // Fetch fees -> rex transfers 
    const rexUrl = `${vaulta_base_url}eosio.rex&after=${startDate}&before=${endDate}&limit=${limit}`;
    const rexResponse: any = await fetchURL(rexUrl);
    let rexTotal = 0;
    if (rexResponse?.actions && rexResponse.actions.length > 0) {
        for (const action of rexResponse.actions) {
            const amount = action.act.data.amount;
            rexTotal += amount;
        }
        dailyRevenue.addCGToken("eos", -rexTotal);

    }

    return { dailyFees, dailyRevenue };
};

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.EOS]: {
            fetch,
            start: "2018-06-14",
        },
    },
    methodology: {
        Fees: "Chain fees collected by system operations eosio.fees account.",
        Revenue: "The eosio.fees account distributes tokens to eosio.bpay for block producer payments and to eosio.rex for REX holders.",
    },
    allowNegativeValue: true,
};

export default adapter;
