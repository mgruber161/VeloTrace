type ActivityPoint = {
  lat: number
  lon: number
  time: number | null
  ele: number | null
  cumulativeDistance: number
  movingTimeSeconds: number
  speed: number
}

type ParsedActivity = {
  title: string
  date: number | null
  points: ActivityPoint[]
  totalDistanceMeters: number
  totalMovingTimeSeconds: number
  totalAscentMeters: number
  hasTime: boolean
  hasElevation: boolean
}

const MAX_REASONABLE_SPEED_MPS = 100 / 3.6

function haversineMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const earthRadiusMeters = 6371000
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const deltaLat = toRad(b.lat - a.lat)
  const deltaLon = toRad(b.lon - a.lon)

  const sinLat = Math.sin(deltaLat / 2)
  const sinLon = Math.sin(deltaLon / 2)
  const x = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

function parseGpx(xmlText: string): ParsedActivity {
  const trackPointRegex = /<trkpt\b[^>]*lat="(-?\d*\.?\d+)"[^>]*lon="(-?\d*\.?\d+)"[^>]*>([\s\S]*?)<\/trkpt>/gi
  const matches: Array<{ lat: number; lon: number; ele: number | null; time: number | null }> = []

  let match: RegExpExecArray | null
  while ((match = trackPointRegex.exec(xmlText)) !== null) {
    const lat = Number(match[1])
    const lon = Number(match[2])
    const innerXml = match[3] ?? ''
    const eleMatch = /<(?:[\w-]+:)?ele\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?ele>/i.exec(innerXml)
    const timeMatch = /<time\b[^>]*>([\s\S]*?)<\/time>/i.exec(innerXml)

    matches.push({
      lat,
      lon,
      ele: eleMatch?.[1] ? Number(eleMatch[1]) : null,
      time: timeMatch?.[1] ? new Date(timeMatch[1]).getTime() : null,
    })
  }

  if (matches.length === 0) {
    throw new Error('No track points were found in this GPX file.')
  }

  const titleMatch = /<metadata[\s\S]*?<name\b[^>]*>([\s\S]*?)<\/name>/i.exec(xmlText)
  const title = (titleMatch?.[1] ?? 'Ride').replace(/<[^>]+>/g, '').trim() || 'Ride'

  const points: ActivityPoint[] = matches.map((point) => ({
    lat: point.lat,
    lon: point.lon,
    ele: point.ele,
    time: point.time,
    cumulativeDistance: 0,
    movingTimeSeconds: 0,
    speed: 0,
  }))

  const validPoints = points.filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon))
  if (validPoints.length === 0) {
    throw new Error('No track points were found in this GPX file.')
  }

  let totalDistanceMeters = 0
  let totalAscentMeters = 0
  let previousElevation: number | null = null
  let previousPoint: ActivityPoint | null = null
  let totalMovingTimeSeconds = 0
  let lastValidSpeed = 0

  for (let index = 0; index < validPoints.length; index += 1) {
    const point = validPoints[index]
    if (previousPoint) {
      const segmentDistance = haversineMeters(previousPoint, point)
      const prevTime = previousPoint.time
      const currentTime = point.time
      const diffSeconds = prevTime !== null && currentTime !== null ? (currentTime - prevTime) / 1000 : 0
      const segmentSpeed = diffSeconds > 0 ? segmentDistance / diffSeconds : 0

      if (diffSeconds > 0) {
        totalMovingTimeSeconds += diffSeconds
      }

      if (prevTime === null || currentTime === null) {
        totalDistanceMeters += segmentDistance
        point.speed = 0
      } else if (segmentSpeed <= MAX_REASONABLE_SPEED_MPS && segmentSpeed > 0) {
        totalDistanceMeters += segmentDistance
        point.speed = segmentSpeed
        lastValidSpeed = segmentSpeed
      } else {
        point.speed = lastValidSpeed
      }

      const deltaElevation = point.ele !== null && previousElevation !== null ? point.ele - previousElevation : 0
      if (deltaElevation > 0) {
        totalAscentMeters += deltaElevation
      }

      if (diffSeconds > 0) {
        point.movingTimeSeconds = totalMovingTimeSeconds
      }
    }

    point.cumulativeDistance = totalDistanceMeters
    if (point.ele !== null) {
      previousElevation = point.ele
    }
    previousPoint = point
  }

  validPoints.forEach((point, index) => {
    if (index > 0 && point.movingTimeSeconds === 0 && validPoints[index - 1]?.movingTimeSeconds) {
      point.movingTimeSeconds = validPoints[index - 1].movingTimeSeconds
    }
  })

  const hasTime = validPoints.some((point) => point.time !== null)
  const hasElevation = validPoints.some((point) => point.ele !== null)
  const date = validPoints[0]?.time ?? null

  return {
    title,
    date,
    points: validPoints,
    totalDistanceMeters,
    totalMovingTimeSeconds,
    totalAscentMeters: hasElevation ? totalAscentMeters : 0,
    hasTime,
    hasElevation,
  }
}

self.onmessage = (event: MessageEvent<{ xmlText: string }>) => {
  try {
    const activity = parseGpx(event.data.xmlText)
    self.postMessage({ ok: true, activity })
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : 'This GPX file could not be read.',
    })
  }
}
