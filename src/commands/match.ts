import Discord from "discord.js"
import _ from "lodash"

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

import { getDb, setDb } from "../db.js"

/* Helper functions */
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

  return channel as Discord.GuildTextBasedChannel
}

async function getMessageReactionUserIds(
  message: Discord.Message,
  emojiName: string
) {
  const reactionUsers = await message.reactions.cache
    .find((reaction) => reaction.emoji.name === emojiName)
    ?.users?.fetch()

  if (reactionUsers && reactionUsers.size > 1) {
    return Array.from(reactionUsers.values()).map((user) => user.id)
  } else {
    return []
  }
}

async function createChannels(
  guild: Discord.Guild,
  everyoneRoleId: string,
  pairs: string[][],
  formatter: Intl.ListFormat,
  time: number
) {
  const weekNumber = dayjs().week()

  const channelIds = []

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i]

    const overwrites: Discord.OverwriteData[] = pair.map((val) => ({
      id: val,
      type: "member",
      allow: ["SEND_MESSAGES", "VIEW_CHANNEL"]
    }))

    const channel = await guild.channels.create(
      `week-${weekNumber}-match-${i + 1}`,
      {
        parent: "960369276445929482",
        type: "GUILD_TEXT",
        permissionOverwrites: [
          { id: everyoneRoleId, type: "role", deny: "VIEW_CHANNEL" },
          {
            id: guild.client.user?.id ?? "",
            type: "member",
            allow: ["VIEW_CHANNEL", "SEND_MESSAGES"]
          },
          ...overwrites
        ]
      }
    )

    channelIds.push(channel.id)

    await channel.send(
      "Hello, " +
        formatter.format(pair.map((id) => `<@${id}>`)) +
        ", you have been paired this week! 👋\n" +
        "Just chat, get to know each other or pick a time to meet digitally! 🤩\n\n" +
        `This is your private channel. 👯 Please note it will be deleted on <t:${time}:F>!`
    )
  }

  return channelIds
}

async function remindChannels(discord: Discord.Client) {
  const channels = getDb("openChannels")
  const deleteChannelsTime = getDb("deleteChannelsTime")

  for (const channelId of channels) {
    const channel = await discord.channels.fetch(channelId)

    if (!channel || !channel.isText()) continue

    await channel.send(
      `**⚠️ This channel will be deleted on <t:${deleteChannelsTime}:F>!**
If you wish to continue talking afterwards, feel free to do so in other channels of the server, or in direct messages!`
    )
  }

  await setDb("remindChannelsTime", 0)
}

async function deleteChannels(discord: Discord.Client) {
  const channels = getDb("openChannels")

  for (const channelId of channels) {
    const channel = await discord.channels.fetch(channelId)

    if (!channel) continue

    await channel.delete("Match time up")
  }

  await setDb("openChannels", [])
  await setDb("deleteChannelsTime", 0)
}

async function sendResults(
  channel: Discord.GuildTextBasedChannel,
  oldMessage: Discord.Message,
  everyoneRoleId: string,
  deleteChannelsTime: number
) {
  // Fetch match message reaction users
  const people = await getMessageReactionUserIds(oldMessage, "👋")

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

  const content =
    "This week's matches are:\n" +
    pairs
      .map((pair) => formatter.format(pair.map((id) => `<@${id}>`)))
      .join("\n")

  // Send matches
  await channel.send(content)

  // Create channels
  const channelIds = await createChannels(
    channel.guild,
    everyoneRoleId,
    pairs,
    formatter,
    deleteChannelsTime
  )

  return channelIds
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

async function matchRoutine(
  channel: Discord.TextBasedChannel,
  customTime?: number
) {
  let time = dayjs().tz("Asia/Hong_Kong").weekday(1).hour(9).minute(0).second(0)

  if (dayjs().tz("Asia/Hong_Kong").day() > 1) {
    time = time.add(7, "day")
  }

  const closeTime = customTime ?? time.unix()

  // Send message
  const message = await sendMatch(closeTime, channel)

  // Set new message id
  await setDb("messageId", message.id)

  // Set time
  await setDb("closeTime", closeTime)
}

async function resultRoutine(
  channel: Discord.GuildTextBasedChannel,
  everyoneRoleId: string
) {
  let oldMessage
  try {
    oldMessage = await channel.messages.fetch(getDb("messageId"))
  } catch (e) {
    throw new Error("The match message cannot be found.")
  }

  // Get reactions and send results
  const deleteChannelsTime = dayjs().add(7, "day").unix()
  const channelIds = await sendResults(
    channel,
    oldMessage,
    everyoneRoleId,
    deleteChannelsTime
  )

  if (channelIds) {
    await setDb("openChannels", channelIds)
    await setDb("deleteChannelsTime", deleteChannelsTime)
    await setDb("remindChannelsTime", dayjs().add(6, "day").unix())
  }

  // Deactivate old message
  await deactivateMessage(oldMessage)

  // Delete message id
  await setDb("messageId", "")

  // Delete time
  await setDb("closeTime", 0)
}

/* Slash commands */

async function weeklyCommand(interaction: Discord.CommandInteraction) {
  const messageId = getDb("messageId")
  const customTime = interaction.options.get("time")?.value

  if (messageId === "") {
    if (customTime) {
      await prompt(
        interaction,
        `Do you want to close the match at <t:${customTime}:F>?`,
        `force_send_new_match:${customTime}`
      )

      return
    }

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
      `Are you sure you want to replace the existing match message with a new one${
        customTime ? `, scheduled to close at <t:${customTime}:F>` : ""
      }?`,
      `force_send_new_match${customTime ? `:${customTime}` : ""}`
    )
  }
}

async function matchCommand(interaction: Discord.CommandInteraction) {
  const messageId = getDb("messageId")

  if (messageId !== "") {
    const time = getDb("closeTime")

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

async function clearMatchCommand(interaction: Discord.CommandInteraction) {
  await setDb("messageId", "")
  await setDb("closeTime", 0)

  await interaction.reply({
    content: "The match details have been cleared.",
    ephemeral: true
  })
}

async function checkIfTime(
  channel: Discord.GuildTextBasedChannel,
  everyoneRoleId: string
) {
  console.log("Checking if time is up...")

  const closeTime = getDb("closeTime")
  const deleteChannelsTime = getDb("deleteChannelsTime")
  const remindChannelsTime = getDb("remindChannelsTime")

  const nowTime = dayjs().unix()

  // If remind time
  if (remindChannelsTime !== 0 && nowTime > remindChannelsTime) {
    console.log("Channels remind time!")

    try {
      await remindChannels(channel.client)
    } catch (error) {
      console.error("Failed to remind channels (timer). ", error)
    }
  }

  // If delete time
  if (deleteChannelsTime !== 0 && nowTime > deleteChannelsTime) {
    console.log("Channels delete time!")

    try {
      await deleteChannels(channel.client)
    } catch (error) {
      console.error("Failed to delete channels (timer). ", error)
    }
  }

  // If close time is up
  if (closeTime !== 0 && nowTime > closeTime) {
    console.log("Time's up! Sending results.")

    try {
      await resultRoutine(channel, everyoneRoleId)
    } catch (error) {
      console.error("Failed to send results (timer). ", error)
    }
  }
}

/* Button commands */

async function sendNewMessage(
  interaction: Discord.ButtonInteraction,
  channel: Discord.TextBasedChannel,
  time?: string
) {
  await interaction.update({
    content: "I have sent a new match message.",
    components: []
  })

  try {
    const oldMessageId = getDb("messageId")
    if (oldMessageId !== "") {
      const oldMessage = await channel.messages.fetch(getDb("messageId"))

      // Deactivate old message
      await deactivateMessage(oldMessage)
    }

    await matchRoutine(channel, time ? parseInt(time) : undefined)
  } catch (error) {
    console.error(error)

    await interaction.editReply({
      content: `Failed to send new match message. ${
        error instanceof Error ? `Error: ${error.message}` : ""
      }`,
      components: []
    })
  }
}

async function sendResultsEarly(
  interaction: Discord.ButtonInteraction,
  channel: Discord.GuildTextBasedChannel,
  everyoneRoleId: string
) {
  await interaction.update({
    content: "Sending matches to the channel now.",
    components: []
  })

  try {
    await resultRoutine(channel, everyoneRoleId)
  } catch (error) {
    console.error(error)

    await interaction.editReply({
      content: `Failed to send results. ${
        error instanceof Error ? `Error: ${error.message}` : ""
      }`,
      components: []
    })
  }
}

/* Exports */

export async function match(
  client: Discord.Client,
  channelId: string,
  everyoneRoleId: string
) {
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

        case "clearmatch":
          clearMatchCommand(interaction)
          break
      }
    }

    if (interaction.isButton()) {
      switch (interaction.customId.split(":")[0]) {
        case "force_send_new_match":
          sendNewMessage(
            interaction,
            channel,
            interaction.customId.split(":")[1]
          )
          break

        case "force_send_result":
          sendResultsEarly(interaction, channel, everyoneRoleId)
          break
      }
    }
  })

  await checkIfTime(channel, everyoneRoleId)

  setInterval(
    () => checkIfTime(channel, everyoneRoleId),
    dayjs.duration({ minutes: 5 }).asMilliseconds()
  )
}

export const matchCommands: Discord.ApplicationCommandData[] = [
  {
    name: "weekly",
    description: "Send a message asking people to match",
    defaultPermission: false,
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
    description: "Match people now",
    defaultPermission: false
  },
  {
    name: "clearmatch",
    description: "Reset match details",
    defaultPermission: false
  }
]
