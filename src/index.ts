import type { Meta, PluginEvent } from '@posthog/plugin-scaffold'
import get from 'lodash.get'
import set from 'lodash.set'

enum PostHogEventType {
  alias = `$create_alias`,
  group = `$groupidentify`,
  identify = `$identify`,
  page = `$pageview`,
}

export enum VarianceEventType {
  'alias' = `alias`,
  'group' = `group`,
  'identify' = `identify`,
  'page' = `page`,
  'track' = `track`,
}

export interface VarianceConfig {
  authHeader: string
  webhookUrl: string
}

interface ValidEvent extends PluginEvent {
  timestamp: string
  uuid: string
}

type Mapping = Record<string, string[] | string>

const generic: Mapping = {
  'anonymousId': [
    `properties.$anon_distinct_id`,
    `properties.$device_id`,
    `properties.distinct_id`,
  ],
  'context.app.version': `properties.posthog_version`,
  'context.ip': `ip`,
  'context.os.name': `properties.$os`,
  'context.page.host': `properties.$host`,
  'context.page.path': `properties.$pathname`,
  'context.page.referrer': `properties.$referrer`,
  'context.page.url': `properties.$current_url`,
  'context.screen.height': `properties.$screen_height`,
  'context.screen.width': `properties.$screen_width`,
  'sentAt': `sent_at`,
  'userId': [`$user_id`, `distinct_id`],
}

const mappings: Record<PostHogEventType, Mapping> = {
  [PostHogEventType.alias]: {
    previousId: `properties.distinct_id`,
    userId: `properties.alias`,
  },
  [PostHogEventType.identify]: {},
  [PostHogEventType.page]: {
    'category': `properties.category`,
    'name': `properties.name`,
    'properties.host': `properties.$host`,
    'properties.path': `properties.$pathname`,
    'properties.referrer': `properties.$referrer`,
    'properties.url': `properties.$current_url`,
  },
  [PostHogEventType.group]: {
    'groupId': `properties.$group_key`,
    'traits.posthog_group_type': `properties.$group_type`,
  },
}

export async function onEvent(
  event: PluginEvent,
  { config }: Meta<{ config: VarianceConfig }>
) {
  if (!isValidEvent(event)) return

  if (event.event.startsWith(`$`) && !isSupportedEvent(event.event)) {
    console.debug(`Unsupported event: ${event.event}`)
    return
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const output: Record<string, any> = {
    libary: {
      name: NAME,
      version: VERSION,
    },
    messageId: event.uuid,
    timestamp: event.timestamp,
  }

  constructPayload(output, event, generic)

  const url = event.properties?.$current_url
  let search: string | undefined
  if (typeof url === `string`) {
    search = new URL(url).search
    set(output, `context.page.search`, search)
  }

  if (isSupportedEvent(event.event)) {
    output.type = getVarianceType(event.event)
    constructPayload(output, event, mappings[event.event])
    switch (event.event) {
      case PostHogEventType.alias:
        break
      case PostHogEventType.group:
        foreachProperties(event.properties?.$groups, (key, value) =>
          set(output, `traits.${key}`, value)
        )
        break
      case PostHogEventType.identify:
        foreachProperties(event.properties?.$set, (key, value) =>
          set(output, `traits.${key}`, value)
        )
        break
      case PostHogEventType.page:
        if (search) set(output, `properties.search`, search)
        break
    }
  } else {
    output.event = event.event
    output.type = VarianceEventType.track
    foreachProperties(event.properties, (key, value) =>
      set(output, `properties.${key}`, value)
    )
  }

  return send(output, config)
}

function foreachProperties(
  properties: unknown,
  cb: (key: string, value: unknown) => void
) {
  if (!properties || typeof properties !== `object`) return
  Object.keys(properties).forEach((key) => {
    const value = (properties as Record<string, undefined>)[key]
    if (key.slice(0, 1) !== `$` && isDefined(value)) cb(key, value)
  })
}

function isValidEvent(event: PluginEvent): event is ValidEvent {
  if (!event.uuid) {
    console.error(`Event missing uuid`)
    return false
  }
  if (!event.timestamp) {
    console.error(`Event missing timestamp`)
    return false
  }
  return true
}

function isSupportedEvent(event: string): event is PostHogEventType {
  return Object.values(PostHogEventType).some((e) => e === event)
}

function getVarianceType(event: PostHogEventType): VarianceEventType {
  switch (event) {
    case PostHogEventType.alias:
      return VarianceEventType.alias
    case PostHogEventType.group:
      return VarianceEventType.group
    case PostHogEventType.identify:
      return VarianceEventType.identify
    case PostHogEventType.page:
      return VarianceEventType.page
  }
}

function isDefined(value: unknown) {
  return value !== undefined && value !== null
}

function constructPayload(
  outPayload: Record<string, unknown>,
  inPayload: PluginEvent,
  mapping: Mapping
) {
  Object.keys(mapping).forEach((varianceKeyPath) => {
    const pHKeyPath = mapping[varianceKeyPath]
    let pHKeyVal = undefined
    if (Array.isArray(pHKeyPath)) {
      for (let i = 0; i < pHKeyPath.length; i++) {
        pHKeyVal = get(inPayload, pHKeyPath[i])
        if (pHKeyVal) {
          break
        }
      }
    } else {
      pHKeyVal = get(inPayload, pHKeyPath)
    }
    if (isDefined(pHKeyVal)) {
      set(outPayload, varianceKeyPath, pHKeyVal)
    }
  })
}

async function send(payload: Record<string, unknown>, config: VarianceConfig) {
  const resp = await fetch(config.webhookUrl, {
    body: JSON.stringify(payload),
    headers: {
      'Authorization': config.authHeader,
      'Content-Type': `application/json`,
    },
    method: `POST`,
  })
  if (!resp.ok) console.error(await resp.text())
}
