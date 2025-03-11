import * as fs from 'fs';
import cloudscraper from 'cloudscraper';

// GraphQL endpoint
const GRAPHQL_ENDPOINT = 'https://fantasy-top.hasura.app/v1/graphql';

// Function to execute GraphQL queries with dynamic variables
async function executeGraphQLQuery() {
    // Define the new query object with correct variables and structure
    const queryPayload = {
        operationName: "GET_CARDS",
        query: `query GET_CARDS($id: String!, $limit: Int = 100, $offset: Int = 0, $where: i_beta_player_cards_type_bool_exp = {}, $sort_order: String = "") {
          get_player_cards: get_player_cards_new(
            args: { p_owner: $id, p_limit: $limit, p_offset: $offset, p_sort_order: $sort_order }
            where: $where
          ) {
            owner
            hero_rarity_index
            cards_number
            listed_cards_number
            in_deck
            card {
              id
              owner
              gliding_score
              hero_rarity_index
              in_deck
              picture_url
              token_id
              hero_rarity_index
              rarity
              sell_order {
                id
                price_numeric
              }
              hero {
                id
                name
                handle
                profile_image_url_https
                followers_count
                flags {
                  flag_id
                }
                stars
                current_score {
                  fantasy_score
                  views
                  current_rank
                }
              }
              floor_price
              bids(limit: 1, order_by: { price: desc }) {
                id
                price
              }
            }
          }
        }`,
        variables: {
            id: "0xF5F6505c47461eEA1600A7B0b95555f9185AA597",  // Dynamic wallet address
            limit: 100,
            offset: 0,
            sort_order: "cards_score", // Sorting by cards_score
            where: {
                card: {
                    hero: {
                        _or: [
                            { name: { _ilike: "%%" } },
                            { handle: { _ilike: "%%" } }
                        ]
                    },
                    rarity: {
                        _in: ["1", "2", "3", "4"]
                    }
                }
            }
        }
    };

    try {
        const response = await cloudscraper({
            method: 'POST',
            url: GRAPHQL_ENDPOINT,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIweEY1RjY1MDVjNDc0NjFlRUExNjAwQTdCMGI5NTU1NWY5MTg1QUE1OTciLCJpYXQiOjE3MjU2OTQyNzEsImV4cCI6MTcyNTczNzQ3MSwiaHR0cHM6Ly9oYXN1cmEuaW8vand0L2NsYWltcyI6eyJ4LWhhc3VyYS1hbGxvd2VkLXJvbGVzIjpbInVzZXIiXSwieC1oYXN1cmEtZGVmYXVsdC1yb2xlIjoidXNlciIsIngtaGFzdXJhLXJvbGUiOiJ1c2VyIiwieC1oYXN1cmEtdXNlci1pZCI6IjB4RjVGNjUwNWM0NzQ2MWVFQTE2MDBBN0IwYjk1NTU1ZjkxODVBQTU5NyJ9fQ.-AJDIHycjTG6j0Byz1yOVExRk--h34umc64gCbIyHfo',
                'Accept': '*/*'
            },
            proxy: {
                host: 'brd.superproxy.io',
                port: 22225,
                auth: {
                    username: 'brd-customer-hl_e38d6b71-zone-datacenter_proxy1',
                    password: 'egl7cyh2lqp9'
                }
            },
            agentOptions: {
                rejectUnauthorized: false
            },
            body: JSON.stringify(queryPayload)
        });

        const parsedResponse = JSON.parse(response);
        // Log the full response to inspect the structure
        console.log('Full Response:', parsedResponse);

        // Check if the data and get_player_cards are present
        if (parsedResponse && parsedResponse.data && parsedResponse.data.get_player_cards) {
            // Process the response to keep only the required fields
            const simplifiedData = parsedResponse.data.get_player_cards.map((item: any) => ({
                id: item.card.hero.id,  // Extract hero id
                rarity: item.card.rarity,  // Extract card rarity
                cards_number: item.cards_number // Extract cards number
            }));

            // Export the simplified data to a JSON file
            fs.writeFileSync('simplified_player_cards.json', JSON.stringify(simplifiedData, null, 2));

            console.log('Simplified data exported to simplified_player_cards.json');
        } else {
            console.error('Error: Invalid response structure, no get_player_cards field found');
        }
    } catch (error) {
        console.error('Error during GraphQL query execution:', error);
    }
}

// Example usage
executeGraphQLQuery();
