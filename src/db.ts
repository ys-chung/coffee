import { Low, JSONFile } from "lowdb"

type State = {
  messageId: string
  closeTime: number
  deleteChannelsTime: number
  remindChannelsTime: number
  openChannels: string[]
}

const adapter = new JSONFile<State>("./data/db.json")

const db = new Low<State>(adapter)
await db.read()

db.data ||= {
  messageId: "",
  closeTime: 0,
  deleteChannelsTime: 0,
  remindChannelsTime: 0,
  openChannels: []
}

await db.write()

export function getDb<K extends keyof State>(property: K) {
  if (!db.data) throw new Error("db not initalised!")

  return db.data[property]
}

export async function setDb<K extends keyof State>(
  property: K,
  value: State[K]
) {
  if (!db.data) throw new Error("db not initalised!")

  db.data[property] = value
  await db.write()

  return getDb(property)
}
