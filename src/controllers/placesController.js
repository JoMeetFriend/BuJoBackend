import { searchAddress } from '../services/placesService.js'

export async function autocompleteAddress(req, res) {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  if (query.length < 2) {
    return res.json({ results: [] })
  }

  const result = await searchAddress(query)

  if (result.status !== 'ok') {
    console.error('LocationIQ 地址搜尋失敗：', result)
    return res.status(502).json({ message: '地址搜尋服務暫時無法使用' })
  }

  res.json({ results: result.results })
}
