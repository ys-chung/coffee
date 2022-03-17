import Discord from "discord.js"
import fs from "node:fs"

import dayjs from "dayjs"
import weekday from "dayjs/plugin/weekday.js"
import timezone from "dayjs/plugin/timezone.js"
import _ from "lodash"
dayjs.extend(weekday)
dayjs.extend(timezone)

dayjs.tz.setDefault("Asia/Hong_Kong")

const MATCH_PATH = "./data/match.json"

class MatchState {
  #messageId: Discord.Snowflake = ""
  #closeTime: number = 0

  #saveObject = {
    closeTime: this.#closeTime,
    messageId: this.#messageId
  }

  constructor() {
    if (fs.existsSync(MATCH_PATH)) {
      const matchData = JSON.parse(fs.readFileSync(MATCH_PATH).toString())

      if (_.isString(matchData.messageId) && _.isNumber(matchData.closeTime)) {
        this.#messageId = matchData.messageId
        this.#closeTime = matchData.closeTime
      }
    }
  }

  private write() {
    fs.writeFileSync(MATCH_PATH, JSON.stringify(this.#saveObject))
  }

  get closeTime() {
    return this.#closeTime
  }

  set closeTime(time: number) {
    this.#closeTime = time
    this.write()
  }

  get messageId() {
    return this.#messageId
  }

  set messageId(id: Discord.Snowflake) {
    this.#messageId = id
    this.write()
  }
}

const state = new MatchState()

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
  if (state.messageId == "" || force) {
    if (force && interaction.isButton()) {
      const message = await interaction.channel?.messages?.fetch(
        interaction.message.id
      )

      if (message) {
        await message.edit({
          content:
            "Another match message is active. Are you sure you want to send a new one?",
          components: [
            {
              type: "ACTION_ROW",
              components: [
                {
                  type: "BUTTON",
                  label: "Yes, send a new one",
                  style: "DANGER",
                  customId: "force_send_new_match",
                  disabled: true
                }
              ]
            }
          ]
        })
      }
    }

    await interaction.reply({
      content: "Sending match message to the channel now",
      ephemeral: true
    })

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
          type: "rich",
          title: "Weekly Design Match",
          description: `React with a 👋 to be matched with somebody for this week's design match.\nMatches will be posted on <t:${postDate.unix()}:F>`,
          color: 0xff31f8
        }
      ]
    })

    state.closeTime = postDate.unix()
    state.messageId = matchMessage?.id ?? ""
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
