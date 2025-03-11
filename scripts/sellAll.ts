require('dotenv').config();
import { parseGwei, createPublicClient, createWalletClient, http, encodeAbiParameters, Address, Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { blast } from 'viem/chains';
import axios from 'axios';
import fs from 'fs';

const FT_SELL_ABI = [
    {
        "inputs": [
            {
                "components": [
                    { "name": "trader", "type": "address" },
                    { "name": "side", "type": "uint8" },
                    { "name": "collection", "type": "address" },
                    { "name": "tokenId", "type": "uint256" },
                    { "name": "paymentToken", "type": "address" },
                    { "name": "price", "type": "uint256" },
                    { "name": "expirationTime", "type": "uint256" },
                    { "name": "merkleRoot", "type": "bytes32" },
                    { "name": "salt", "type": "uint256" }
                ],
                "name": "buyOrder",
                "type": "tuple"
            },
            { "name": "buyerSignature", "type": "bytes" },
            { "name": "tokenId", "type": "uint256" },
            { "name": "merkleProof", "type": "bytes32[]" }
        ],
        "name": "sell",
        "type": "function"
    }
];

const { getProof } = require('./merkleProof');

const privateKey = `0x${process.env.WES_SNIPER_PK}` as `0x${string}`;
const httpEndpoint = process.env.HTTP_ENDPOINT as string;

const account = privateKeyToAccount(privateKey);
const client = createWalletClient({
    account,
    transport: http(httpEndpoint),
    chain: blast,
});

const publicClient = createPublicClient({
    transport: http(httpEndpoint),
    chain: blast,
});

const FANTASY_TOP_CA = process.env.FANTASY_TOP_CA as `0x${string}`;

// Function to introduce a delay
function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Fetch bids for a specific hero and rarity
async function fetchBids(hero_id: string, rarity: number) {
    const url = `https://fantasy.top/api/bids/get-bid-orders?hero_id=${hero_id}&rarity=${rarity}&include_highest_five_bids=true`;

    console.log(`Fetching bids for hero_id: ${hero_id} with rarity: ${rarity}`);
    
    try {
        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIweEY1RjY1MDVjNDc0NjFlRUExNjAwQTdCMGI5NTU1NWY5MTg1QUE1OTciLCJpYXQiOjE3MjU2OTQyNzEsImV4cCI6MTcyNTczNzQ3MSwiaHR0cHM6Ly9oYXN1cmEuaW8vand0L2NsYWltcyI6eyJ4LWhhc3VyYS1hbGxvd2VkLXJvbGVzIjpbInVzZXIiXSwieC1oYXN1cmEtZGVmYXVsdC1yb2xlIjoidXNlciIsIngtaGFzdXJhLXJvbGUiOiJ1c2VyIiwieC1oYXN1cmEtdXNlci1pZCI6IjB4RjVGNjUwNWM0NzQ2MWVFQTE2MDBBN0IwYjk1NTU1ZjkxODVBQTU5NyJ9fQ.-AJDIHycjTG6j0Byz1yOVExRk--h34umc64gCbIyHfo`,
                'Accept': '*/*'
            }
        });
        console.log(`Fetched bids successfully for hero_id: ${hero_id}`);
        return response.data.highest_five_bids || [];
    } catch (error) {
        console.error('Error fetching bids:', error);
        return [];
    }
}

// Fetch the latest nonce and retry logic
async function getLatestNonce(address: Address) {
    return await publicClient.getTransactionCount({ address });
}

// Fill a bid and sell a token with nonce management
async function fillBid(buyOrder: any, myTokenId: string, nonce: number) {
    console.log(`Filling bid for buy order ${buyOrder.id} with token ID ${myTokenId}`);

    const tokenIds = JSON.parse(buyOrder.token_ids.replace(/'/g, '"')); // Ensure JSON format is correct
    const { root, formattedProof } = await getProof(myTokenId, tokenIds);

    let merkleRoot = root.startsWith('0x') ? root.slice(2) : root;
    merkleRoot = merkleRoot.slice(0, 64);

    const encodedData = encodeAbiParameters(
        FT_SELL_ABI[0].inputs,
        [
            {
                trader: buyOrder.trader,
                side: 0n,
                collection: buyOrder.collection,
                tokenId: 0n,
                paymentToken: buyOrder.payment_token,
                price: BigInt(buyOrder.price),
                expirationTime: BigInt(buyOrder.expiration_time),
                merkleRoot: `0x${merkleRoot}`,
                salt: BigInt(buyOrder.salt)
            },
            buyOrder.signature,
            BigInt(myTokenId),
            formattedProof.map((p: string) => `0x${p}`)
        ]
    );

    const data = ('0x00cb1eef' + encodedData.slice(2)) as Hex;
    const maxPriorityFeePerGas = parseGwei((1.601 * Math.random()).toString());

    try {
        const transactionRequest = await client.prepareTransactionRequest({
            to: FANTASY_TOP_CA,
            data,
            gas: 500000n,
            maxPriorityFeePerGas,
            nonce: nonce
        });

        const txHash = await client.sendTransaction(transactionRequest);
        console.log(`Transaction Hash: ${txHash}`);

        // Return success and the next nonce
        return nonce + 1;
    } catch (error) {
        console.error('Error filling bid:', error);
        return nonce;
    }
}

// Main function to handle selling the tokens with strict sequential execution
async function handleSell() {
    console.log("Starting the selling process...");
    let simplifiedCards;
    try {
        simplifiedCards = JSON.parse(fs.readFileSync('simplified_player_cards.json', 'utf8'));
    } catch (error) {
        console.error('Error reading simplified_player_cards.json:', error);
        return;
    }

    const myTokenIds = new Set<string>(JSON.parse(fs.readFileSync('token_ids_only.json', 'utf8')));
    let nonce = await getLatestNonce(account.address);

    for (const card of simplifiedCards) {
        if (!card || !card.id || typeof card.rarity === 'undefined') {
            console.error('Invalid card data:', card);
            continue;
        }

        const repetitions = card.number || 1; 
        for (let i = 0; i < repetitions; i++) {
            try {
                const bids = await fetchBids(card.id, card.rarity);

                if (bids.length === 0) {
                    console.log(`No bids found for hero_id: ${card.id}`);
                    continue;
                }

                let foundTokenForHero = false;
                let bidIndex = 0;  // Keep track of which bid to use next

                for (const bid of bids) {
                    if (!bid.token_ids) {
                        console.error('Invalid bid data for hero_id: ', card.id);
                        continue;
                    }

                    const bidTokenIds = JSON.parse(bid.token_ids.replace(/'/g, '"'));
                    const bidTokenIdSet = new Set<string>(bidTokenIds);
                    const matchingTokenIds = [...myTokenIds].filter(id => bidTokenIdSet.has(id));

                    if (matchingTokenIds.length > 0) {
                        foundTokenForHero = true;

                        for (const tokenId of matchingTokenIds) {
                            console.log(`Matching token found: ${tokenId}`);
                            nonce = await fillBid(bids[bidIndex], tokenId, nonce); // Use current bid
                            bidIndex++; // Move to the next bid
                            myTokenIds.delete(tokenId);

                            await delay(7000);
                        }
                    }
                }

                if (!foundTokenForHero) {
                    console.log(`No matching tokens found for hero_id: ${card.id}`);
                }

            } catch (error) {
                console.error(`Error processing card with hero_id ${card.id} and rarity ${card.rarity}:`, error);
            }

            await delay(2000);
        }
    }

    console.log("Finished processing all cards.");
}

// Execute the sell process
handleSell().catch(console.error);
