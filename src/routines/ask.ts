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

import { getDb, setDb } from "../db.js"
import { prompt } from "../util.js"
import { deactivateMessage } from "./pair.js"

async function askRoutine(
  channel: Discord.TextBasedChannel,
  customTime?: number
) {
  // 1. Get the time
  let time = dayjs().tz("Asia/Hong_Kong").weekday(1).hour(9).minute(0).second(0)

  if (dayjs().tz("Asia/Hong_Kong").day() > 1) {
    time = time.add(7, "day")
  }

  const closeTime = customTime ?? time.unix()

  // 2. Send the ask message
  const sentAskMessage = await sendAsk(channel, closeTime)

  // 3. Save the ask message id
  await setDb("messageId", sentAskMessage.id)

  // 4. Save the close time
  await setDb("closeTime", closeTime)
}

async function sendAsk(channel: Discord.TextBasedChannel, closeTime: number) {
  // 1. Send the message and return it
  return await channel.send({
    content: "Hi everybody, want to meet somebody new this week?",
    embeds: [
      {
        title: "Weekly Design Match",
        description:
          Discord.Formatters.bold(
            "React with a 👋 to be matched with somebody for this week's design match."
          ) + `\n\nMatches will be posted on <t:${closeTime}:F>`,
        color: 0xff31f8
      }
    ]
  })
}

export async function askCommand(interaction: Discord.CommandInteraction) {
  const existingMessageId = getDb("messageId")
  const customTime = interaction.options.get("time")?.value as
    | number
    | undefined

  // 1. Check if existing active ask message exists
  if (existingMessageId !== "") {
    // 1a. If exists, prompt if want to send a new one
    await prompt(
      interaction,
      `Are you sure you want to replace the existing match message with a new one${
        customTime ? `, scheduled to close at <t:${customTime}:F>` : ""
      }?`,
      `force_send_new_match${customTime ? `:${customTime}` : ""}`
    )
  } else {
    // 1b. If does not exist, send an ask message
    await interaction.reply({
      content: "Sending match message to the channel now",
      ephemeral: true
    })

    // Send message
    if (!interaction.channel) throw new Error("Interaction has no channel!")

    await askRoutine(interaction.channel, customTime)
  }
}

export async function forceAskButton(
  interaction: Discord.ButtonInteraction,
  channel: Discord.TextBasedChannel
) {
  // 1. Update the interaction to remove the button
  await interaction.update({
    content: "I have sent a new match message.",
    components: []
  })

  try {
    // 2. Get the existing message id
    const existingMessageId = getDb("messageId")

    // 3. Deactivate the existing message
    if (existingMessageId !== "") {
      const oldMessage = await channel.messages.fetch(getDb("messageId"))

      // Deactivate old message
      await deactivateMessage(oldMessage)
    }

    // 4. Send the new message
    await askRoutine(channel)
  } catch (error) {
    console.error(error)

    // If anything fails, report back to the interaction
    await interaction.editReply({
      content: `Failed to send new match message. ${
        error instanceof Error ? `Error: ${error.message}` : ""
      }`,
      components: []
    })
  }
}
