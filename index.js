const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  registerSlashCommands();
});

async function registerSlashCommands() {
  const guildId = process.env.GUILD_ID;

  const commands = [
    {
      name: 'problem',
      description: 'Search for a programming problem',
    },
  ];

  try {
    const guild = await client.guilds.fetch(guildId);
    const existingCommands = await guild.commands.fetch();

    // Delete all existing commands
    for (const command of existingCommands.values()) {
      await guild.commands.delete(command.id);
    }

    // Create the new command
    await guild.commands.set(commands);

    console.log('Slash commands and bot description registered successfully!');
  } catch (error) {
    console.error('Error registering slash commands and bot description:', error);
  }
}

async function searchProblem() {
  try {
    const response = await axios.get(
      'https://codeforces.com/api/problemset.problems'
    );

    const problems = response.data.result.problems;

    if (problems.length > 0) {
      const randomIndex = Math.floor(Math.random() * problems.length);
      const { name, index, contestId } = problems[randomIndex];
      const problemUrl = `https://codeforces.com/problemset/problem/${contestId}/${index}`;
      return problemUrl;
    } else {
      return null;
    }
  } catch (error) {
    console.error(error);
    return null;
  }
}

async function scrapeProblemDescription(url) {
  try {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    const title = $('.title')
      .first()
      .text()
      .replace(/InputOutputInputOutput/g, '')
      .trim();
    const timeLimit = $('.time-limit .property-title').text().trim();
    const memoryLimit = $('.memory-limit').text().trim();
    const inputFile = $('.input-file').text().trim();
    const outputFile = $('.output-file').text().trim();

    // Extract and format the <p> elements within the problem statement
    const problemDescription = $('.problem-statement')
      .find('p')
      .map((_, el) => $(el).text().trim())
      .get()
      .join('\n\n'); // Separate <p> elements with a new line

    // Format variables and math expressions as code
    const formattedDescription = problemDescription.replace(/\$\$\$(.*?)\$\$\$/g, '`$1`');

    // Replace math symbols and expressions with Markdown equivalents
    const markdownDescription = formattedDescription
      .replace(/\\ldots/g, '...')
      .replace(/\\leq/g, '≤')
      .replace(/\\geq/g, '≤')
      .replace(/\\neq/g, '≠')
      .replace(/\\frac{([^}]+)}{([^}]+)}/g, '($1/$2)')
      .replace(/a_([0-9]+)/g, 'aᵢ')
      .replace(/10\^([0-9]+)/g, (_, n) => `10^${n}`);

    // Truncate problem description if it exceeds a certain length
    const maxDescriptionLength = 1500;
    let truncatedDescription = markdownDescription;
    if (truncatedDescription.length > maxDescriptionLength) {
      truncatedDescription = truncatedDescription.substring(0, maxDescriptionLength);
      const lastSentenceEndIndex = truncatedDescription.lastIndexOf('.') + 1;
      truncatedDescription = truncatedDescription.substring(0, lastSentenceEndIndex) + '...';
    }

    const formattedTitle = `**${title}**`;
    const formattedTimeLimit = `time limit per test: ${timeLimit}`;
    const formattedMemoryLimit = `memory limit per test: ${memoryLimit}`;
    const formattedInputFile = `input: ${inputFile}`;
    const formattedOutputFile = `output: ${outputFile}`;

    const formattedOutput = `
${formattedTitle}
${formattedTimeLimit}
${formattedMemoryLimit}
${formattedInputFile}
${formattedOutputFile}

${truncatedDescription.trim()}
`;

    return formattedOutput;
  } catch (error) {
    console.error('Error scraping problem description:', error);
    return null;
  }
}



client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'problem') {
    const problemUrl = await searchProblem();
    const problemDescription = await scrapeProblemDescription(problemUrl);

    if (problemUrl && problemDescription) {
      // Truncate the problem description if it exceeds 2000 characters
      const truncatedDescription = problemDescription.substring(0, 2000);

      const message = `Here's a problem: ${problemUrl}\n\n${truncatedDescription}`;
      interaction.reply(message);
    } else {
      interaction.reply('No problem found.');
    }
  }
});


client.login(process.env.DISCORD_BOT_TOKEN);

const app = express();
const port = 3000;

app.get('/problem', async (req, res) => {
  const problemUrl = await searchProblem();

  if (problemUrl) {
   const problemDescription = await scrapeProblemDescription(problemUrl);
    if (problemDescription) {
      res.json({ problem: { url: problemUrl, description: problemDescription } });
    } else {
      res.status(500).json({ message: 'Failed to retrieve the problem description.' });
    }
  } else {
    res.status(404).json({ message: 'No problem found.' });
  }
});

app.listen(port, () => {
  console.log(`API server listening at http://localhost:${port}`);
});