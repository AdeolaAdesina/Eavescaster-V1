import { Client, GatewayIntentBits } from 'discord.js';
import fetch from 'node-fetch';
import fs from 'fs';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

// Warpcast API endpoint
const WARPCAST_CHANNELS_API = 'https://api.warpcast.com/v2/all-channels';

// Keywords to monitor for in channel names or descriptions
const KEYWORDS = ['airdrop', 'token launch', 'new token', 'giveaway'];

// File to store notified channels
const NOTIFIED_CHANNELS_FILE = 'notified_channels.json';

// Initialize Discord client
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// Load notified channels from file
function loadNotifiedChannels() {
    try {
        const data = fs.readFileSync(NOTIFIED_CHANNELS_FILE, 'utf8');
        return new Set(JSON.parse(data));
    } catch (err) {
        return new Set(); // Return empty set if file does not exist
    }
}

// Save notified channels to file
function saveNotifiedChannels(notifiedChannels) {
    fs.writeFileSync(NOTIFIED_CHANNELS_FILE, JSON.stringify([...notifiedChannels]), 'utf8');
}

// Function to fetch all channels from Warpcast
async function getAllChannels() {
    const response = await fetch(WARPCAST_CHANNELS_API);
    const data = await response.json();
    return data.result?.channels || [];
}

// Check if a channel has keywords like airdrop or token launch
function checkForKeywords(channel) {
    const description = channel.description?.toLowerCase() || '';
    const name = channel.name?.toLowerCase() || '';

    return KEYWORDS.some(keyword => description.includes(keyword) || name.includes(keyword));
}

// Send a message to the Discord channel
async function sendDiscordMessage(channel) {
    const message = `🚨 New Airdrop or Token Launch Alert! 🚨\n\n` +
                    `**Channel**: ${channel.name}\n` +
                    `**Description**: ${channel.description}\n` +
                    `**Link**: ${channel.url}`;
    
    const discordChannel = await client.channels.fetch(DISCORD_CHANNEL_ID);
    await discordChannel.send(message);
}

// Monitor channels for new airdrops or token launches
async function monitorChannels() {
    const notifiedChannels = loadNotifiedChannels();  // Load notified channels
    const channels = await getAllChannels();  // Fetch all channels

    for (const channel of channels) {
        if (!notifiedChannels.has(channel.id) && checkForKeywords(channel)) {
            await sendDiscordMessage(channel);  // Send notification to Discord
            notifiedChannels.add(channel.id);   // Mark channel as notified
            saveNotifiedChannels(notifiedChannels);  // Save updated channels list
        }
    }
}

// Command handler for getting the latest airdrop mention
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    if (message.content === '!latest-airdrop') {
        try {
            const response = await fetch('https://api.warpcast.com/v2/all-channels');
            if (!response.ok) {
                throw new Error('Failed to fetch channels');
            }
            const channelsData = await response.json();

            if (!channelsData.result || !channelsData.result.channels) {
                throw new Error('Invalid data format from Warpcast API');
            }

            const channels = channelsData.result.channels;
            let latestAirdrop = null;

            for (const channel of channels) {
                const channelResponse = await fetch(`https://api.warpcast.com/v1/channel/${channel.id}`);
                if (!channelResponse.ok) {
                    throw new Error(`Failed to fetch data for channel ${channel.id}`);
                }
                const channelData = await channelResponse.json();

                if (!channelData.result || !channelData.result.channel) {
                    throw new Error('Invalid data format from Warpcast API for channel');
                }

                const channelMentions = channelData.result.channel;

                // Check for mentions of "airdrop"
                if (channelMentions.description && channelMentions.description.includes('airdrop')) {
                    latestAirdrop = channelMentions;
                    break;
                }
            }

            if (latestAirdrop) {
                message.channel.send(`Latest airdrop mention found in channel: ${latestAirdrop.name}\nDescription: ${latestAirdrop.description}`);
            } else {
                message.channel.send('No airdrop mentions found.');
            }
        } catch (error) {
            console.error('Error fetching data:', error);
            message.channel.send(`An error occurred while fetching data: ${error.message}`);
        }
    }
});

// Bot login and setup
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    setInterval(monitorChannels, 10 * 60 * 1000);  // Monitor every 10 minutes
});

console.log(`Bot token: ${DISCORD_BOT_TOKEN}`);

// Log in to Discord
client.login(DISCORD_BOT_TOKEN);
