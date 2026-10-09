import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiGet } from '@/services/api'
import { ApiClientError } from '@/types/api'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiGet', () => {
  it('returns data from a success envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        json: async () => ({ success: true, data: { status: 'ok' } }),
      }),
    )
    await expect(apiGet<{ status: string }>('/api/health')).resolves.toEqual({ status: 'ok' })
  })

  it('throws ApiClientError from an error envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 404,
        json: async () => ({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Missing', details: {} },
        }),
      }),
    )
    await expect(apiGet('/api/missing')).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'NOT_FOUND',
      status: 404,
    } satisfies Partial<ApiClientError>)
  })
})
