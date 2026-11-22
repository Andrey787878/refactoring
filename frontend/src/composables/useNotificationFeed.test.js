import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { notificationsApi } from '../api/notifications'
import { useNotificationFeed } from './useNotificationFeed'

vi.mock('../api/notifications', () => ({
  notificationsApi: {
    getAll: vi.fn(),
    markRead: vi.fn(),
  },
}))

describe('useNotificationFeed', () => {
  let feedState
  let wrapper
  let socket
  let WebSocketMock

  function mountFeed(token = 'token-123') {
    wrapper = mount(defineComponent({
      setup() {
        feedState = useNotificationFeed({ token })
        return () => null
      },
    }))
    return wrapper
  }

  beforeEach(() => {
    vi.clearAllMocks()
    notificationsApi.getAll.mockResolvedValue({
      data: {
        items: [
          { id: 'initial-1', read_at: null },
          { id: 'initial-2', read_at: null },
          { id: 'initial-3', read_at: '2026-01-01T00:00:00Z' },
        ],
      },
    })
    notificationsApi.markRead.mockResolvedValue({})
    socket = { close: vi.fn(), onmessage: null, onerror: null }
    WebSocketMock = vi.fn(function MockWebSocket() { return socket })
    vi.stubGlobal('WebSocket', WebSocketMock)
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.unstubAllGlobals()
  })

  it('fetches once, applies separately, and marks only the requested unread IDs', async () => {
    mountFeed()

    const initialRequest = feedState.fetchInitial()
    expect(notificationsApi.getAll).toHaveBeenCalledTimes(1)
    expect(notificationsApi.getAll).toHaveBeenCalledWith({ limit: 30 })

    const [initialResult] = await Promise.allSettled([initialRequest])
    expect(feedState.feed.value).toEqual([])
    expect(feedState.feedLoading.value).toBe(true)

    feedState.applyInitial(initialResult)
    expect(feedState.feed.value.map(notification => notification.id)).toEqual(['initial-1', 'initial-2', 'initial-3'])
    expect(feedState.unreadCount.value).toBe(2)
    expect(feedState.feedLoading.value).toBe(false)

    await feedState.markRead(feedState.feed.value[0])
    await feedState.markRead(feedState.feed.value[0])
    await feedState.markAllRead()
    expect(notificationsApi.markRead).toHaveBeenCalledTimes(2)
    expect(notificationsApi.markRead).toHaveBeenNthCalledWith(1, 'initial-1')
    expect(notificationsApi.markRead).toHaveBeenNthCalledWith(2, 'initial-2')
    expect(feedState.unreadCount.value).toBe(0)
  })

  it('preserves notifications received over the socket when the initial request fails', async () => {
    notificationsApi.getAll.mockRejectedValueOnce(new Error('network error'))
    mountFeed()

    const initialRequest = feedState.fetchInitial()
    socket.onmessage({ data: JSON.stringify({ id: 'socket-1', read_at: null }) })
    const [initialResult] = await Promise.allSettled([initialRequest])
    feedState.applyInitial(initialResult)

    expect(feedState.feed.value.map(notification => notification.id)).toEqual(['socket-1'])
    expect(feedState.unreadCount.value).toBe(1)
    expect(feedState.feedLoading.value).toBe(false)
  })

  it('connects with the auth token, handles socket messages, and closes on unmount', () => {
    const mounted = mountFeed()

    expect(WebSocketMock).toHaveBeenCalledTimes(1)
    expect(WebSocketMock).toHaveBeenCalledWith(
      `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/notifications?token=token-123`,
    )

    socket.onmessage({ data: JSON.stringify({ id: 'socket-1', read_at: null }) })
    expect(feedState.feed.value[0].id).toBe('socket-1')
    expect(feedState.unreadCount.value).toBe(1)

    mounted.unmount()
    expect(socket.close).toHaveBeenCalledTimes(1)
  })
})
