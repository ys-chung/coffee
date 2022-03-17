import Discord from "discord.js"
import _ from "lodash"

import dayjs from "dayjs"
import weekday from "dayjs/plugin/weekday.js"
import timezone from "dayjs/plugin/timezone.js"
dayjs.extend(weekday)
dayjs.extend(timezone)

dayjs.tz.setDefault("Asia/Hong_Kong")

import db from "../db.js"

export const matchCommands: Discord.ApplicationCommandData[] = [
  {
    name: "weekly",
    description: "Send a message asking people to match",
    defaultPermission: false
  },
  {
    name: "match",
    description: "Match people now",
    defaultPermission: false
  }
]

async function sendStartMatchMessage(
  interaction: Discord.CommandInteraction | Discord.ButtonInteraction,
  force = false
) {
  if ((db.data && db.data.messageId == "") || force) {
    if (!db.data) {
      throw new Error("db data is null!")
    }

    if (force && interaction.isButton()) {
      await interaction.update({
        content: "I have sent a new match message.",
        components: []
      })
    } else {
      await interaction.reply({
        content: "Sending match message to the channel now",
        ephemeral: true
      })
    }

    const postDate = dayjs()
      .add(7, "day")
      .weekday(2)
      .hour(9)
      .minute(0)
      .second(0)

    const matchMessage = await interaction.channel?.send({
      content: "Hi everybody, want to meet somebody new this week?",
      embeds: [
        {
          title: "Weekly Design Match",
          description:
            Discord.Formatters.bold(
              "React with a 👋 to be matched with somebody for this week's design match."
            ) + `\n\nMatches will be posted on <t:${postDate.unix()}:F>`,
          color: 0xff31f8
        }
      ]
    })

    db.data.closeTime = postDate.unix()
    db.data.messageId = matchMessage?.id ?? ""

    await db.write()
  } else {
    await interaction.reply({
      content:
        "Another match message is active. Are you sure you want to send a new one?",
      ephemeral: true,
      components: [
        {
          type: "ACTION_ROW",
          components: [
            {
              type: "BUTTON",
              label: "Yes, send a new one",
              style: "DANGER",
              customId: "force_send_new_match"
            }
          ]
        }
      ]
    })
  }
}

async function sendCloseMatchMessage(interaction: Discord.CommandInteraction) {}

export function match(client: Discord.Client) {
  client.on("interactionCreate", (interaction) => {
    if (interaction.isCommand()) {
      switch (interaction.commandName) {
        case "weekly":
          sendStartMatchMessage(interaction)
          break

        case "match":
          sendCloseMatchMessage(interaction)
          break
      }
    }

    if (interaction.isButton()) {
      switch (interaction.customId) {
        case "force_send_new_match":
          sendStartMatchMessage(interaction, true)
          break
      }
    }
  })
}
