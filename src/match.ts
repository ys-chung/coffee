import Discord from "discord.js"

import dayjs from "dayjs"
import weekday from "dayjs/plugin/weekday.js"
import utc from "dayjs/plugin/utc.js"
import timezone from "dayjs/plugin/timezone.js"
import duration from "dayjs/plugin/duration.js"
import weekOfYear from "dayjs/plugin/weekOfYear.js"
dayjs.extend(weekday)
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(duration)
dayjs.extend(weekOfYear)

import { fetchChannel } from "./util.js"
import { askCommand, forceAskButton } from "./routines/ask.js"
import { pairCommand } from "./routines/pair.js"
import { checkIfTime } from "./routines/interval.js"
import { nudgeChannels } from "./routines/nudge.js"
import { fullDb } from "./db.js"

export async function match(
  client: Discord.Client,
  channelId: string,
  everyoneRoleId: string,
  categoryId: string
) {
  const channel = await fetchChannel(client, channelId)

  client.on("interactionCreate", (interaction) => {
    if (interaction.channel?.id !== channelId) return

    if (interaction.isCommand()) {
      switch (interaction.commandName) {
        case "weekly":
          askCommand(interaction)
          break

        case "match":
          pairCommand(interaction, channel, everyoneRoleId, categoryId)
          break

        case "nudge":
          nudgeChannels(client)
          break
        
        case "state":
          void interaction.reply(JSON.stringify(fullDb))
          break
      }
    }

    if (interaction.isButton()) {
      switch (interaction.customId.split(":")[0]) {
        case "force_send_new_match":
          forceAskButton(interaction, channel)
          break
      }
    }
  })

  await checkIfTime(channel, everyoneRoleId, categoryId)

  setInterval(
    () => checkIfTime(channel, everyoneRoleId, categoryId),
    dayjs.duration({ minutes: 5 }).asMilliseconds()
  )
}

export const matchCommands: Discord.ApplicationCommandData[] = [
  {
    name: "weekly",
    description: "Send a message asking people to match",
    options: [
      {
        type: "INTEGER",
        name: "time",
        description: "The unix timestamp (in seconds) of the closing time",
        required: false
      }
    ]
  },
  {
    name: "match",
    description: "Match people now"
  },
  {
    name: "nudge",
    description: "Nudge people now"
  },
  {
    name: "state",
    description: "Print state"
  }
]
