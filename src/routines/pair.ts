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

async function getMessageReactionUserIds(
  message: Discord.Message,
  emojiName: string
) {
  // 1. Fetch the user ids
  const reactionUsers = await message.reactions.cache
    .find((reaction) => reaction.emoji.name === emojiName)
    ?.users?.fetch()

  // 2. If there are users who reacted, return the ids in an array, otherwise return an empty array
  if (reactionUsers && reactionUsers.size > 1) {
    return Array.from(reactionUsers.values()).map((user) => user.id)
  } else {
    return []
  }
}

export async function deactivateMessage(message: Discord.Message) {
  // Edit the old message
  await message.edit({
    content: "Thanks for participating! This match has been closed.",
    embeds: []
  })
}

function generatePairs(list: string[]) {
  if (list.length === 0) return null

  const pairs = _.chunk(_.shuffle(list), 2)

  if (pairs.length > 1 && pairs[pairs.length - 1].length === 1) {
    pairs[pairs.length - 2].push(pairs[pairs.length - 1][0])
    pairs.splice(pairs.length - 1, 1)
  }

  return pairs
}

async function sendPairs(
  channel: Discord.GuildTextBasedChannel,
  pairs: string[][]
) {
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
}

async function createChannels(
  guild: Discord.Guild,
  everyoneRoleId: string,
  pairs: string[][],
  closeChannelsTime: number,
  categoryId: string
) {
  const formatter = new Intl.ListFormat("en", {
    style: "long",
    type: "conjunction"
  })

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
        parent: categoryId,
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
        `This is your private channel. Please note it will be deleted at <t:${closeChannelsTime}:F>!`
    )
  }

  return channelIds
}

export async function pairRoutine(
  channel: Discord.GuildTextBasedChannel,
  everyoneRoleId: string,
  categoryId: string
) {
  // 1. Find the existing message
  let existingMessage = await channel.messages.fetch(getDb("messageId"))

  // 2. Get the reactions of the old result
  const people = await getMessageReactionUserIds(existingMessage, "👋")

  // 3. Generate pairs
  const pairs = generatePairs(people)

  // 4. Set time for deleting channels and reminders
  const deleteChannelsTime = dayjs().add(7, "day").subtract(30, "minute").unix()
  const remindChannelsTime = dayjs().add(6, "day").unix()

  // 5. Send out the pairs
  if (pairs) {
    await sendPairs(channel, pairs)

    // 6. Create channels for each pair
    const channelIds = await createChannels(
      channel.guild,
      everyoneRoleId,
      pairs,
      deleteChannelsTime,
      categoryId
    )

    // 7. Save open channels, delete channels & reminder time to db
    await setDb("openChannels", channelIds)
    await setDb("deleteChannelsTime", deleteChannelsTime)
    await setDb("remindChannelsTime", remindChannelsTime)
  }

  // 8. Deactivate existing message
  await deactivateMessage(existingMessage)

  // 9. Delete existing message id and close time
  await setDb("messageId", "")
  await setDb("closeTime", 0)
}

export async function pairCommand(
  interaction: Discord.CommandInteraction,
  channel: Discord.GuildTextBasedChannel,
  everyoneRoleId: string,
  categoryId: string
) {
  // 1. Get existing message from db
  const existingMessageId = getDb("messageId")

  // 2. If there is an existing message, run pair routine
  if (existingMessageId !== "") {
    await pairRoutine(channel, everyoneRoleId, categoryId)

    await interaction.reply({
      content: "Paired and created channels.",
      ephemeral: true
    })
  } else {
    // 2a. If there is no exisitng message, alert user
    await interaction.reply({
      content: "There is currently no active match message.",
      ephemeral: true
    })
  }
}
