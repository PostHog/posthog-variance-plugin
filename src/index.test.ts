import type { PluginEvent } from '@posthog/plugin-scaffold'
import { getMeta, resetMeta } from '@posthog/plugin-scaffold/test/utils'
import fetchMock, { enableFetchMocks } from 'jest-fetch-mock'

import type { VarianceConfig } from '.'
import { VarianceEventType } from '.'
import autocapture from './fixtures/autocapture.json'
import alias from './fixtures/create_alias.json'
import custom from './fixtures/custom.json'
import feature_flag_called from './fixtures/feature_flag_called.json'
import groupidentify from './fixtures/groupidentify.json'
import identify from './fixtures/identify.json'
import pageleave from './fixtures/pageleave.json'
import pageview from './fixtures/pageview.json'
import { onEvent } from './index'

const config: VarianceConfig = {
  authHeader: `Basic ...`,
  webhookUrl: `https://variance.variance.dev`,
}
resetMeta({ config })

function buildEvent(json: Record<string, unknown>): PluginEvent {
  return {
    ...json,
    timestamp: `2020-11-26T12:58:58.453Z`,
    uuid: `0`,
  } as PluginEvent
}

describe(`supported`, () => {
  enableFetchMocks()
  afterEach(() => {
    fetchMock.resetMocks()
  })

  async function assertFetch(
    json: Record<string, unknown>,
    eventType: VarianceEventType
  ) {
    await onEvent(buildEvent(json), getMeta())
    expect(fetchMock.mock.calls[0][0]).toBe(config.webhookUrl)
    const opts = fetchMock.mock.calls[0][1]
    expect(opts?.headers).toEqual({
      'Authorization': config.authHeader,
      'Content-Type': `application/json`,
    })
    if (typeof opts?.body !== `string`) throw new Error(`Body should be string`)
    const body = JSON.parse(opts.body)
    expect(body.type).toBe(eventType)
    expect(body.messageId).toBe(`0`)
    expect(body).toMatchSnapshot()
  }

  it(`$create_alias`, async () => {
    await assertFetch(alias, VarianceEventType.alias)
  })

  it(`$groupidentify`, async () => {
    await assertFetch(groupidentify, VarianceEventType.group)
  })

  it(`$identify`, async () => {
    await assertFetch(identify, VarianceEventType.identify)
  })

  it(`$pageview`, async () => {
    await assertFetch(pageview, VarianceEventType.page)
  })

  it(`custom event`, async () => {
    await assertFetch(custom, VarianceEventType.track)
  })
})

describe(`ignore`, () => {
  const mockDebug = jest.spyOn(console, `debug`).mockImplementation(() => {
    /**/
  })

  afterEach(() => {
    mockDebug.mockReset()
  })

  async function assertIgnore(json: Record<string, unknown>) {
    await onEvent(buildEvent(json), getMeta())
    expect(mockDebug).toBeCalledWith(`Unsupported event: ${String(json.event)}`)
  }

  it(`$autocapture`, async () => {
    await assertIgnore(autocapture)
  })

  it(`$feature_flag_called`, async () => {
    await assertIgnore(feature_flag_called)
  })

  it(`$pageleave`, async () => {
    await assertIgnore(pageleave)
  })
})
