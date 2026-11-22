import { ref } from 'vue'
import { teacherRequestsApi } from '../api/teacherRequests'

export function useTeacherRoleRequests({ approving, showToast }) {
  const requests = ref([])
  const loading = ref(true)
  const error = ref('')

  async function load() {
    loading.value = true
    error.value = ''
    try {
      // teacherRequestsApi.listPending() returns TeacherRequestResponse items.
      const list = await teacherRequestsApi.listPending()
      requests.value = Array.isArray(list) ? list : (list?.items ?? [])
    } catch (e) {
      error.value = e.response?.data?.message || e.response?.data?.error || 'Не удалось загрузить заявки'
    } finally {
      loading.value = false
    }
  }

  async function approve(request) {
    approving.value = request.id
    try {
      await teacherRequestsApi.approve(request.id)
      requests.value = requests.value.filter((item) => item.id !== request.id)
    } catch (e) {
      showToast(e.response?.data?.message || e.response?.data?.error || 'Не удалось одобрить заявку')
    } finally {
      approving.value = null
    }
  }

  async function reject(id, reason) {
    await teacherRequestsApi.reject(id, reason)
    requests.value = requests.value.filter((item) => item.id !== id)
  }

  return { requests, loading, error, load, approve, reject }
}
