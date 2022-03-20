import Discord from "discord.js"
import _ from "lodash"

import dayjs from "dayjs"
import weekday from "dayjs/plugin/weekday.js"
import timezone from "dayjs/plugin/timezone.js"
import duration from "dayjs/plugin/duration.js"
dayjs.extend(weekday)
dayjs.extend(timezone)
dayjs.extend(duration)

import db from "../db.js"

/* Helper functions */

function getTime() {
  if (db.data) {
    return db.data.closeTime
  } else {
    throw new Error("Db data not initialised")
  }
}

async function setTime(time: number) {
  if (db.data) {
    db.data.closeTime = time
    await db.write()
    return getTime()
  } else {
    throw new Error("Db data not initialised")
  }
}

function getMessageId() {
  if (db.data) {
    return db.data.messageId
  } else {
    throw new Error("Db data not initialised")
  }
}

async function setMessageId(messageId: string) {
  if (db.data) {
    db.data.messageId = messageId
    await db.write()
    return getMessageId()
  } else {
    throw new Error("Db data not initialised")
  }
}

async function prompt(
  interaction: Discord.CommandInteraction,
  content: string,
  buttonCommandName: string
) {
  await interaction.reply({
    content,
    ephemeral: true,
    components: [
      {
        type: "ACTION_ROW",
        components: [
          {
            type: "BUTTON",
            label: "Yes, I am sure",
            style: "DANGER",
            customId: buttonCommandName
          }
        ]
      }
    ]
  })
}

async function fetchChannel(client: Discord.Client, id: Discord.Snowflake) {
  const channel = await client.channels.fetch(id)

  if (!channel || !channel.isText())
    throw new Error("Fetched channel is not a text channel!")

  return channel
}

async function fetchMessage(
  channel: Discord.TextBasedChannel,
  messageId: string
) {
  const message = await channel.messages.fetch(messageId)

  if (!message) throw new Error("Message not found")

  return message
}

async function getMessageReactionUserIds(
  message: Discord.Message,
  emojiName: string
) {
  const reactionUsers = await message.reactions.cache
    .find((reaction) => reaction.emoji.name === emojiName)
    ?.users?.fetch()

  if (reactionUsers) {
    return Array.from(reactionUsers.values()).map((user) => user.id)
  } else {
    return []
  }
}

async function sendResults(
  channel: Discord.TextBasedChannel,
  oldMessage: Discord.Message
) {
  // Fetch match message reaction users
  const people = (await getMessageReactionUserIds(oldMessage, "👋")).map(
    (id) => `<@${id}>`
  )

  if (people.length === 0) return null

  // Shuffle and generate pairs
  const pairs = _.chunk(_.shuffle(people), 2)

  if (pairs.length > 1 && pairs[pairs.length - 1].length === 1) {
    pairs[pairs.length - 2].push(pairs[pairs.length - 1][0])
    pairs.splice(pairs.length - 1, 1)
  }

  const formatter = new Intl.ListFormat("en", {
    style: "long",
    type: "conjunction"
  })

  const content = pairs.map((pair) => formatter.format(pair)).join("\n")

  // Send matches
  return await channel.send(content)
}

async function sendMatch(time: number, channel: Discord.TextBasedChannel) {
  return await channel.send({
    content: "Hi everybody, want to meet somebody new this week?",
    embeds: [
      {
        title: "Weekly Design Match",
        description:
          Discord.Formatters.bold(
            "React with a 👋 to be matched with somebody for this week's design match."
          ) + `\n\nMatches will be posted on <t:${time}:F>`,
        color: 0xff31f8
      }
    ]
  })
}

async function deactivateMessage(message: Discord.Message) {
  await message.edit({
    content: "Thanks for participating! This match has been closed.",
    embeds: []
  })
}

async function matchRoutine(channel: Discord.TextBasedChannel) {
  const closeTime =
    dayjs().day() < 2
      ? dayjs().weekday(2).hour(9).minute(0).second(0).unix()
      : dayjs().add(7, "day").weekday(2).hour(9).minute(0).second(0).unix()

  // Send message
  const message = await sendMatch(closeTime, channel)

  // Set new message id
  await setMessageId(message.id)

  // Set time
  await setTime(closeTime)
}

async function resultRoutine(channel: Discord.TextBasedChannel) {
  const oldMessage = await fetchMessage(channel, getMessageId())

  // Get reactions and send results
  await sendResults(channel, oldMessage)

  // Deactivate old message
  await deactivateMessage(oldMessage)

  // Delete message id
  await setMessageId("")

  // Delete time
  await setTime(0)
}

/* Slash commands */

async function weeklyCommand(interaction: Discord.CommandInteraction) {
  const messageId = getMessageId()

  if (messageId === "") {
    await interaction.reply({
      content: "Sending match message to the channel now",
      ephemeral: true
    })

    // Send message
    if (!interaction.channel) throw new Error("Interaction has no channel!")

    await matchRoutine(interaction.channel)
  } else {
    await prompt(
      interaction,
      "Are you sure you want to replace the existing match message with a new one?",
      "force_send_new_match"
    )
  }
}

async function matchCommand(interaction: Discord.CommandInteraction) {
  const messageId = getMessageId()

  if (messageId !== "") {
    const time = getTime()

    await prompt(
      interaction,
      `The match is scheduled for <t:${time}:F>. Are you sure you want to send the match results early?`,
      "force_send_result"
    )
  } else {
    await interaction.reply({
      content: "There is currently no active match message.",
      ephemeral: true
    })
  }
}

async function checkIfTime(channel: Discord.TextBasedChannel) {
  const closeTime = getTime()

  if (closeTime !== 0 && dayjs().unix() > closeTime) {
    await resultRoutine(channel)
  }
}

/* Button commands */

async function sendNewMessage(
  interaction: Discord.ButtonInteraction,
  channel: Discord.TextBasedChannel
) {
  await interaction.update({
    content: "I have sent a new match message.",
    components: []
  })

  const oldMessage = await fetchMessage(channel, getMessageId())

  // Deactivate old message
  await deactivateMessage(oldMessage)

  await matchRoutine(channel)
}

async function sendResultsEarly(
  interaction: Discord.ButtonInteraction,
  channel: Discord.TextBasedChannel
) {
  await interaction.update({
    content: "Sending matches to the channel now.",
    components: []
  })

  await resultRoutine(channel)
}

/* Exports */

export async function match(client: Discord.Client, channelId: string) {
  const channel = await fetchChannel(client, channelId)

  client.on("interactionCreate", (interaction) => {
    if (interaction.channel?.id !== channelId) return

    if (interaction.isCommand()) {
      switch (interaction.commandName) {
        case "weekly":
          weeklyCommand(interaction)
          break

        case "match":
          matchCommand(interaction)
          break
      }
    }

    if (interaction.isButton()) {
      switch (interaction.customId) {
        case "force_send_new_match":
          sendNewMessage(interaction, channel)
          break

        case "force_send_result":
          sendResultsEarly(interaction, channel)
          break
      }
    }
  })

  await checkIfTime(channel)

  setInterval(
    () => checkIfTime(channel),
    dayjs.duration({ minutes: 5 }).milliseconds()
  )
}

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
