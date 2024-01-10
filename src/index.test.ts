import type { Meta, PostHogEvent } from '@posthog/plugin-scaffold'
import type { VarianceMetaInput } from '.'
import { VarianceEventType } from '.'
import autocapture from './fixtures/autocapture.json'
import alias from './fixtures/create_alias.json'
import custom from './fixtures/custom.json'
import feature_flag_called from './fixtures/feature_flag_called.json'
import groupidentify from './fixtures/groupidentify.json'
import identify from './fixtures/identify.json'
import pageleave from './fixtures/pageleave.json'
import pageview from './fixtures/pageview.json'
import { composeWebhook } from './index'

const meta: Meta<VarianceMetaInput> = {
  attachments: {},
  cache: {
      expire: async () => true,
      get: async () => {
          //
      },
      incr: async () => 1,
      llen: async () => 1,
      lpop: async () => [],
      lpush: async () => 1,
      lrange: async () => [],
      lrem: async () => 1,
      set: async () => {
          //
      },
  },
  config: {
      authHeader: `Bearer 1234`,
      webhookUrl: 'http://webhook'
  },
  geoip: {
      locate: async () => null,
  },
  global: {},
  jobs: {},
  metrics: {},
  storage: {
      del: async () => {
          //
      },
      get: async () => {
          //
      },
      set: async () => {
          //
      },
  },
  utils: {
      cursor: {
          increment: async () => 1,
          init: async () => {
              //
          },
      },
  },
}

const badEvent: PostHogEvent = {
  uuid: '10000000-0000-4000-0000-000000000000',
  team_id: 1,
  distinct_id: '1234',
  event: '$bad-event',
  timestamp: new Date(),
  properties: {
      $ip: '127.0.0.1',
      $elements_chain: 'div:nth-child="1"nth-of-type="2"text="text"',
      foo: 'bar',
  },
}

function buildEvent(json: Record<string, unknown>): PostHogEvent {
  return {
    ...json,
    timestamp: new Date(`2020-11-26T12:58:58.453Z`),
    uuid: `10000000-0000-4000-0000-000000000000`,
  } as PostHogEvent
}

describe(`supported`, () => {
  function assertReturnValue(
    json: Record<string, unknown>,
    eventType: VarianceEventType
  ) {
    const webhook = composeWebhook(buildEvent(json), meta)
    const {config} = meta
    expect(webhook?.headers).toEqual({
      'Authorization': config.authHeader,
      'Content-Type': `application/json`,
    })
    if (typeof webhook?.body !== `string`) throw new Error(`Body should be string`)
    const body = JSON.parse(webhook.body)
    expect(body.type).toBe(eventType)
    expect(body.messageId).toBe(`10000000-0000-4000-0000-000000000000`)
    expect(body).toMatchSnapshot()
  }

  it(`$create_alias`, () => {
    assertReturnValue(alias, VarianceEventType.alias)
  })

  it(`$groupidentify`, () => {
    assertReturnValue(groupidentify, VarianceEventType.group)
  })

  it(`$identify`, () => {
    assertReturnValue(identify, VarianceEventType.identify)
  })

  it(`$pageview`, () => {
    assertReturnValue(pageview, VarianceEventType.page)
  })

  it(`custom event`, () => {
    assertReturnValue(custom, VarianceEventType.track)
  })

  it(`bad event returns null`, () => {
    expect(composeWebhook(badEvent, meta)).toBeNull()
  })
})

describe(`ignore`, () => {
  const mockDebug = jest.spyOn(console, `debug`).mockImplementation(() => {
    /**/
  })

  afterEach(() => {
    mockDebug.mockReset()
  })

  function assertIgnore(json: Record<string, unknown>) {
    composeWebhook(buildEvent(json), meta)
    expect(mockDebug).toBeCalledWith(`Unsupported event: ${String(json.event)}`)
  }

  it(`$autocapture`, () => {
    assertIgnore(autocapture)
  })

  it(`$feature_flag_called`, () => {
    assertIgnore(feature_flag_called)
  })

  it(`$pageleave`, () => {
    assertIgnore(pageleave)
  })
})
