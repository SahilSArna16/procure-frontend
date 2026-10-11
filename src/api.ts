const base = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
export const apiUrl = (path: string) => `${base}/api${path}`

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(apiUrl(path), options)
  } catch {
    throw new Error('Cannot reach the backend. Start the Python API on port 8000 and try again.')
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(typeof body.detail === 'string' ? body.detail : response.status === 422 ? 'Some values are invalid. Check positive weights, quantities, rates, and unique SKU IDs.' : `Request failed (${response.status}). Please retry.`)
  }
  return response.json()
}

export const jsonBody = (body: unknown, method = 'POST'): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
