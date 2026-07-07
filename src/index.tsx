/** @jsxImportSource @opentui/solid */

import type { Message, Part } from "@opencode-ai/sdk/v2"
import type { Renderable, TuiPluginApi, TuiPluginMeta, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { createMemo, createSignal, type Accessor } from "solid-js"

type PinRecord = {
  sessionID: string
  messageID: string
  createdAt: number
}

type PinOption = {
  maxSidebarItems?: number
}

const PLUGIN_ID = "opencode.message-pins"
const PLUGIN_VERSION = "0.1.0"
const MAX_SIDEBAR_ITEMS = 8

function pinKey(sessionID: string) {
  return `${PLUGIN_ID}.pins.${sessionID}`
}

function getPins(api: TuiPluginApi, sessionID: string) {
  return api.kv.get<PinRecord[]>(pinKey(sessionID), [])
}

function setPins(api: TuiPluginApi, sessionID: string, pins: PinRecord[]) {
  api.kv.set(pinKey(sessionID), pins)
}

function getActiveSessionID(api: TuiPluginApi): string | undefined {
  const route = api.route.current
  if (route.name !== "session") return undefined
  const sessionID = route.params?.sessionID
  return typeof sessionID === "string" ? sessionID : undefined
}

function isUserMessage(message: Message | undefined) {
  return message?.role === "user"
}

function rawMessageText(api: TuiPluginApi, message: Message): string {
  return api.state.part(message.id).map(partText).filter(Boolean).join(" ")
}

function cleanMessageText(text: string): string {
  return text
    .replace(/<internal_reminder>[\s\S]*?(?:<\/internal_reminder>|$)/g, "")
    .replace(/<task\b[^>]*>[\s\S]*?(?:<\/task>|$)/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function isSystemInjected(api: TuiPluginApi, message: Message): boolean {
  const text = cleanMessageText(rawMessageText(api, message))
  return text.length === 0 || /^Background task (?:started|completed):/.test(text)
}

function isPinned(api: TuiPluginApi, sessionID: string, messageID: string) {
  return getPins(api, sessionID).some((pin) => pin.messageID === messageID)
}

function togglePin(api: TuiPluginApi, sessionID: string, messageID: string) {
  const message = api.state.session.messages(sessionID).find((item) => item.id === messageID)
  if (!isUserMessage(message)) return false

  const pins = getPins(api, sessionID)
  const existing = pins.some((pin) => pin.messageID === messageID)
  const next = existing
    ? pins.filter((pin) => pin.messageID !== messageID)
    : [...pins, { sessionID, messageID, createdAt: Date.now() }]

  setPins(api, sessionID, next)
  api.ui.toast({
    variant: existing ? "info" : "success",
    message: existing ? "Message unpinned." : "Message pinned.",
    duration: 1200,
  })
  api.renderer.requestRender()
  return true
}

type ScrollLike = Renderable & {
  scrollChildIntoView?: (childId: string) => void
}

function jumpToMessage(api: TuiPluginApi, messageID: string) {
  const root = api.renderer.root

  function tryScroll(node: Renderable): void {
    const candidate = node as ScrollLike
    if (typeof candidate.scrollChildIntoView === "function") {
      try {
        candidate.scrollChildIntoView(messageID)
      } catch {}
    }
    for (const child of node.getChildren()) {
      tryScroll(child)
    }
  }

  tryScroll(root)
  api.renderer.requestRender()
}

type ScrollBoxLike = Renderable & {
  scrollHeight?: number
  scrollTo?: (position: number | { x: number; y: number }) => void
}

function jumpToBottom(api: TuiPluginApi) {
  const root = api.renderer.root
  const state: { target: ScrollBoxLike | null; maxScrollHeight: number } = {
    target: null,
    maxScrollHeight: 0,
  }

  function findLargestScroll(node: Renderable): void {
    const candidate = node as ScrollBoxLike
    if (typeof candidate.scrollTo === "function" && typeof candidate.scrollHeight === "number") {
      if (candidate.scrollHeight > state.maxScrollHeight) {
        state.maxScrollHeight = candidate.scrollHeight
        state.target = candidate
      }
    }
    for (const child of node.getChildren()) {
      findLargestScroll(child)
    }
  }

  findLargestScroll(root)
  const target = state.target
  if (target && typeof target.scrollTo === "function") {
    try {
      target.scrollTo(state.maxScrollHeight)
    } catch {}
  }
  api.renderer.requestRender()
}

function openPinDialog(api: TuiPluginApi, sessionID: string, refreshPins: () => void, current?: string) {
  const messages = api.state.session.messages(sessionID).filter((m) => isUserMessage(m) && !isSystemInjected(api, m)).slice().reverse()

  if (messages.length === 0) {
    api.ui.toast({ variant: "warning", message: "No user messages found in this session." })
    return
  }

  api.ui.dialog.replace(() => (
    <api.ui.DialogSelect<string>
      title="Pin user message"
      placeholder="Search user messages"
      options={messages.map((message) => ({
        title: `${isPinned(api, sessionID, message.id) ? "◆" : " "} • ${messageSummary(api, message)}`,
        value: message.id,
        description: message.id,
        footer: isPinned(api, sessionID, message.id) ? "pinned" : "enter to pin",
      }))}
      current={current}
      onMove={(option) => jumpToMessage(api, option.value)}
      onSelect={(option) => {
        togglePin(api, sessionID, option.value)
        refreshPins()
        openPinDialog(api, sessionID, refreshPins, option.value)
      }}
    />
  ))
}

function messageSummary(api: TuiPluginApi, message: Message | undefined, max = 80) {
  if (!message) return "Message no longer exists."
  const text = cleanMessageText(rawMessageText(api, message))
  if (text) return truncate(text, max)
  return shortID(message.id)
}

function partText(part: Part) {
  if ("text" in part && typeof part.text === "string") return part.text
  if ("content" in part && typeof part.content === "string") return part.content
  if ("summary" in part && typeof part.summary === "string") return part.summary
  return ""
}

function shortID(id: string) {
  return id.length <= 12 ? id : `${id.slice(0, 6)}...${id.slice(-4)}`
}

function truncate(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}...`
}

function PinsSidebar(props: {
  api: TuiPluginApi
  sessionID: string
  maxItems: number
  pluginVersion: string
  tick: Accessor<number>
}) {
  const pins = createMemo(() => {
    props.tick()
    const messages = props.api.state.session.messages(props.sessionID)
    const userMessageIDs = new Set(messages.filter((m) => isUserMessage(m) && !isSystemInjected(props.api, m)).map((message) => message.id))
    return getPins(props.api, props.sessionID)
      .filter((pin) => userMessageIDs.has(pin.messageID))
      .slice(-props.maxItems)
      .reverse()
  })

  const theme = props.api.theme.current

  return (
    <box width="100%" flexDirection="column" paddingTop={1} paddingBottom={1} paddingLeft={1} paddingRight={1}>
      <box width="100%" flexDirection="row" justifyContent="space-between" alignItems="center">
        <box backgroundColor={theme.accent} paddingLeft={1} paddingRight={1}>
          <text fg={theme.background}>Message Pins</text>
        </box>
        <text fg={theme.textMuted}>{`v${props.pluginVersion}`}</text>
      </box>
      <box width="100%" flexDirection="row" justifyContent="space-between" alignItems="center" marginTop={1}>
        <text fg={theme.text}>Pinned</text>
        <box onMouseUp={() => jumpToBottom(props.api)}>
          <text fg={theme.textMuted}>↓ Bottom</text>
        </box>
      </box>
      <box
        width="100%"
        flexDirection="column"
        border
        borderColor={theme.borderActive}
        marginTop={1}
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={1}
        paddingRight={1}
      >
        {pins().length === 0 ? (
          <text fg={theme.textMuted}>No pinned user messages.</text>
        ) : (
          pins().map((pin) => {
            const message = props.api.state.session.messages(pin.sessionID).find((item) => item.id === pin.messageID)
            return (
              <box
                width="100%"
                flexDirection="row"
                marginBottom={1}
                onMouseUp={() => jumpToMessage(props.api, pin.messageID)}
              >
                <text fg={theme.accent} width={2}>
                  ◆
                </text>
                <box flexDirection="column" flexGrow={1}>
                  <text fg={theme.textMuted} truncate>{messageSummary(props.api, message, 40)}</text>
                </box>
              </box>
            )
          })
        )}
      </box>
    </box>
  )
}

async function tui(api: TuiPluginApi, options?: PinOption, meta?: TuiPluginMeta) {
  const maxSidebarItems = options?.maxSidebarItems ?? MAX_SIDEBAR_ITEMS
  const pluginVersion = meta?.version ?? PLUGIN_VERSION
  const [tick, setTick] = createSignal(0)
  const refreshPins = () => setTick((value) => value + 1)

  api.event.on("message.updated", () => refreshPins())
  api.event.on("message.removed", () => refreshPins())
  api.event.on("session.updated", () => refreshPins())

  api.slots.register({
    order: 900,
    slots: {
      sidebar_content() {
        const sessionID = getActiveSessionID(api)
        if (!sessionID) return null
        return <PinsSidebar api={api} sessionID={sessionID} maxItems={maxSidebarItems} pluginVersion={pluginVersion} tick={tick} />
      },
    },
  })

  api.keymap.registerLayer({
    commands: [
      {
        name: "messagePins.pin",
        title: "Pin user message",
        desc: "Jump through user messages and pin or unpin the selected one",
        category: "Message Pins",
        namespace: "palette",
        slashName: "pin",
        run() {
          const sessionID = getActiveSessionID(api)
          if (!sessionID) {
            api.ui.toast({ variant: "warning", message: "Open a session before pinning a message." })
            return
          }
          openPinDialog(api, sessionID, refreshPins)
        },
      },
    ],
  })
}

export default {
  id: PLUGIN_ID,
  tui,
} satisfies TuiPluginModule & { id: string }
