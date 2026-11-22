import { onMounted, onUnmounted, ref } from 'vue'
import { notificationsApi } from '../api/notifications'

export function useNotificationFeed(auth) {
  const feed = ref([])
  const feedLoading = ref(true)
  const unreadCount = ref(0)
  let ws = null

  async function markRead(notification) {
    if (notification.read_at) return
    notification.read_at = new Date().toISOString()
    unreadCount.value = Math.max(0, unreadCount.value - 1)
    try { await notificationsApi.markRead(notification.id) } catch { /* silent */ }
  }

  async function markAllRead() {
    const unread = feed.value.filter(notification => !notification.read_at)
    unread.forEach(notification => { notification.read_at = new Date().toISOString() })
    unreadCount.value = 0
    await Promise.allSettled(unread.map(notification => notificationsApi.markRead(notification.id)))
  }

  function fetchInitial() {
    return notificationsApi.getAll({ limit: 30 })
  }

  function applyInitial(result) {
    if (result.status === 'fulfilled') {
      feed.value = result.value.data.items ?? result.value.data ?? []
      unreadCount.value = feed.value.filter(notification => !notification.read_at).length
    }
    feedLoading.value = false
  }

  function connectWS() {
    if (!auth.token) return
    try {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${location.host}/ws/notifications?token=${auth.token}`)
      ws.onmessage = (event) => {
        try {
          const notification = JSON.parse(event.data)
          feed.value.unshift(notification)
          if (!notification.read_at) unreadCount.value++
        } catch { /* ignore non-json */ }
      }
      ws.onerror = () => {}
    } catch { /* ignore ws errors */ }
  }

  onMounted(connectWS)
  onUnmounted(() => { ws?.close() })

  return { feed, feedLoading, unreadCount, fetchInitial, applyInitial, markRead, markAllRead }
}
