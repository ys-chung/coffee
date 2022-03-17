import "dotenv/config"

import _ from "lodash"
import Discord from "discord.js"

import { match, matchCommands } from "./commands/match.js"

function getConfig() {
  const { TOKEN, GUILD_ID, MOD_ROLE_ID, MATCH_CHANNEL_ID } = process.env

  if (!(TOKEN && GUILD_ID && MOD_ROLE_ID && MATCH_CHANNEL_ID)) {
    throw new Error("Please set all environmental variables.")
  }

  return { TOKEN, GUILD_ID, MOD_ROLE_ID, MATCH_CHANNEL_ID }
}

async function registerCommands(guild: Discord.Guild, modRoleId: string) {
  const commands = await guild.commands.set(matchCommands)

  for (const [, command] of commands) {
    if (command.defaultPermission === false) {
      await command.permissions.set({
        permissions: [
          {
            id: modRoleId,
            type: "ROLE",
            permission: true
          }
        ]
      })
    }
  }
}

async function init() {
  const { TOKEN, GUILD_ID, MOD_ROLE_ID } = getConfig()

  const client = new Discord.Client({
    intents: ["GUILDS", "GUILD_INTEGRATIONS", "GUILD_MESSAGE_REACTIONS"]
  })

  await client.login(TOKEN)

  // Register commands
  const guild = await client.guilds.fetch(GUILD_ID as Discord.Snowflake)

  await registerCommands(guild, MOD_ROLE_ID)

  match(client)
}

void init()
