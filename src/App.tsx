import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react'
import * as maplibregl from 'maplibre-gl'
import { setWorkerUrl } from 'maplibre-gl'
import { ArrayBufferTarget, Muxer } from 'mp4-muxer'
import 'maplibre-gl/dist/maplibre-gl.css'
import './App.css'
import { findPointAtMovingTime } from './routeMath'

setWorkerUrl(new URL('../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).toString())

type DurationOption = 15 | 30 | 45 | 60

type ResolutionOption = '720p' | '1080p'
type FrameRateOption = 30 | 60
type ExportFormatOption = 'mp4' | 'webm'
type MapStyleOption = 'standard' | 'satellite'
type UnitOption = 'metric' | 'imperial'

type OverlayToggles = {
  distance: boolean
  speed: boolean
  elevation: boolean
  ascent: boolean
}

type Settings = {
  duration: DurationOption
  resolution: ResolutionOption
  frameRate: FrameRateOption
  exportFormat: ExportFormatOption
  mapStyle: MapStyleOption
  units: UnitOption
  overlays: OverlayToggles
}

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

const STORAGE_KEY = 'velotrace:settings'
const END_SCREEN_DURATION = 5
const MAX_REASONABLE_SPEED_MPS = 100 / 3.6
const VIDEO_TRACKING_ZOOM = 12.5
const MAX_EXPORTED_ROUTE_POINTS = 1200

function formatMovingTime(totalSeconds: number): string {
  const totalMinutes = Math.max(0, Math.round(totalSeconds / 60))
  if (totalMinutes < 60) {
    return `${totalMinutes} min`
  }

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours}h ${minutes}m`
}

const DEFAULT_SETTINGS: Settings = {
  duration: 30,
  resolution: '720p',
  frameRate: 30,
  exportFormat: 'mp4',
  mapStyle: 'satellite',
  units: 'metric',
  overlays: {
    distance: true,
    speed: true,
    elevation: true,
    ascent: true,
  },
}

const standardMapStyle = {
  version: 8,
  name: 'VeloTrace Standard',
  sources: {
    openstreetmap: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'openstreetmap', type: 'raster', source: 'openstreetmap' }],
} as const

const satelliteMapStyle = {
  version: 8,
  name: 'VeloTrace Satellite',
  sources: {
    esri: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: '© Esri',
    },
  },
  layers: [{ id: 'esri', type: 'raster', source: 'esri' }],
} as const

function loadSettings(): Settings {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return DEFAULT_SETTINGS

  try {
    const parsed = JSON.parse(raw) as Partial<Settings>
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      resolution: DEFAULT_SETTINGS.resolution,
      overlays: {
        ...DEFAULT_SETTINGS.overlays,
        ...(parsed.overlays ?? {}),
      },
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function formatDistance(value: number, unit: UnitOption): string {
  if (unit === 'imperial') {
    return `${(value / 1609.344).toFixed(2)} mi`
  }
  return `${(value / 1000).toFixed(2)} km`
}

function formatSpeed(value: number, unit: UnitOption): string {
  const metersPerSecond = Math.min(Math.max(value, 0), MAX_REASONABLE_SPEED_MPS)
  const kilometersPerHour = metersPerSecond * 3.6
  if (unit === 'imperial') {
    return `${(kilometersPerHour / 1.60934).toFixed(1)} mph`
  }
  return `${kilometersPerHour.toFixed(1)} km/h`
}

function sanitizeTitle(value: string): string {
  return value
    .trim()
    .replace(/[^a-z0-9-_ ]/gi, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 40) || 'velotrace-video'
}

function drawRiderMarkerOnCanvas(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  radius = 18,
): void {
  const glow = ctx.createRadialGradient(screenX, screenY, 2, screenX, screenY, radius + 14)
  glow.addColorStop(0, 'rgba(252, 76, 2, 0.28)')
  glow.addColorStop(0.4, 'rgba(252, 76, 2, 0.18)')
  glow.addColorStop(1, 'rgba(252, 76, 2, 0)')

  ctx.beginPath()
  ctx.fillStyle = glow
  ctx.arc(screenX, screenY, radius + 14, 0, Math.PI * 2)
  ctx.fill()

  ctx.beginPath()
  ctx.fillStyle = '#FC4C02'
  ctx.arc(screenX, screenY, radius, 0, Math.PI * 2)
  ctx.fill()

  ctx.beginPath()
  ctx.fillStyle = '#FFFFFF'
  ctx.arc(screenX, screenY, radius * 0.38, 0, Math.PI * 2)
  ctx.fill()
}

function drawVideoPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  fill = 'rgba(15, 23, 42, 0.82)',
): void {
  ctx.save()
  ctx.fillStyle = fill
  ctx.shadowColor = 'rgba(15, 23, 42, 0.24)'
  ctx.shadowBlur = 24
  ctx.shadowOffsetY = 8
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, 28)
  ctx.fill()
  ctx.restore()
}

function getTileCoordinates(lon: number, lat: number, zoom: number): [number, number] {
  const scale = 2 ** zoom
  const x = Math.floor(((lon + 180) / 360) * scale)
  const latitude = Math.max(-85.05112878, Math.min(85.05112878, lat))
  const y = Math.floor(
    ((1 - Math.asinh(Math.tan((latitude * Math.PI) / 180)) / Math.PI) / 2) * scale,
  )
  return [Math.max(0, Math.min(scale - 1, x)), Math.max(0, Math.min(scale - 1, y))]
}

function getTileUrl(mapStyle: MapStyleOption, zoom: number, x: number, y: number): string {
  if (mapStyle === 'satellite') {
    return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`
  }
  return `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`
}

function getExportRouteCoords(
  points: ActivityPoint[],
  endIndex: number,
  isEndScreen: boolean,
): Array<[number, number]> {
  const visiblePoints = isEndScreen ? points : points.slice(0, Math.min(points.length, Math.max(2, endIndex + 1)))
  const step = Math.max(1, Math.ceil(visiblePoints.length / MAX_EXPORTED_ROUTE_POINTS))
  return visiblePoints
    .filter((_, index) => index % step === 0 || index === visiblePoints.length - 1)
    .map((entry) => [entry.lon, entry.lat] as [number, number])
}

async function preloadMapTiles(
  points: ActivityPoint[],
  mapStyle: MapStyleOption,
  viewportWidth: number,
  viewportHeight: number,
): Promise<void> {
  const tiles = new Set<string>()
  const zooms = [11, 13]
  const horizontalRadius = Math.ceil(viewportWidth / 512) + 1
  const verticalRadius = Math.ceil(viewportHeight / 512) + 1

  for (const point of points) {
    for (const zoom of zooms) {
      const [tileX, tileY] = getTileCoordinates(point.lon, point.lat, zoom)
      const tileScale = 2 ** zoom
      for (let deltaX = -horizontalRadius; deltaX <= horizontalRadius; deltaX += 1) {
        for (let deltaY = -verticalRadius; deltaY <= verticalRadius; deltaY += 1) {
          const x = (tileX + deltaX + tileScale) % tileScale
          const y = tileY + deltaY
          if (y >= 0 && y < tileScale) {
            tiles.add(getTileUrl(mapStyle, zoom, x, y))
          }
        }
      }
    }
  }

  const tileUrls = [...tiles]
  for (let index = 0; index < tileUrls.length; index += 24) {
    const batch = tileUrls.slice(index, index + 24)
    await Promise.all(batch.map((url) => new Promise<void>((resolve) => {
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.onload = () => resolve()
      image.onerror = () => resolve()
      image.src = url
    })))
  }
}

function drawRouteOnCanvas(
  ctx: CanvasRenderingContext2D,
  routeCoords: Array<[number, number]>,
  map: maplibregl.Map,
  drawWidth: number,
  drawHeight: number,
  offsetX: number,
  offsetY: number,
  cropX = 0,
  cropY = 0,
  cropWidth = map.getContainer().clientWidth,
  cropHeight = map.getContainer().clientHeight,
): void {
  if (routeCoords.length < 2) return

  ctx.beginPath()
  const first = routeCoords[0]
  const firstProjected = map.project(first)
  const startX = offsetX + ((firstProjected.x - cropX) / cropWidth) * drawWidth
  const startY = offsetY + ((firstProjected.y - cropY) / cropHeight) * drawHeight
  ctx.moveTo(startX, startY)

  for (let index = 1; index < routeCoords.length; index += 1) {
    const coord = routeCoords[index]
    const projected = map.project(coord)
    const x = offsetX + ((projected.x - cropX) / cropWidth) * drawWidth
    const y = offsetY + ((projected.y - cropY) / cropHeight) * drawHeight
    ctx.lineTo(x, y)
  }

  ctx.strokeStyle = '#FC4C02'
  ctx.lineWidth = 6
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.shadowColor = 'rgba(252, 76, 2, 0.25)'
  ctx.shadowBlur = 12
  ctx.stroke()
  ctx.shadowBlur = 0

  ctx.beginPath()
  ctx.moveTo(startX, startY)
  for (let index = 1; index < routeCoords.length; index += 1) {
    const coord = routeCoords[index]
    const projected = map.project(coord)
    const x = offsetX + ((projected.x - cropX) / cropWidth) * drawWidth
    const y = offsetY + ((projected.y - cropY) / cropHeight) * drawHeight
    ctx.lineTo(x, y)
  }
  ctx.strokeStyle = 'rgba(255, 184, 153, 0.8)'
  ctx.lineWidth = 12
  ctx.stroke()
}

function readActivityFromFile(file: File): Promise<ParsedActivity> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const worker = new Worker(new URL('./workers/gpxWorker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (event) => {
        worker.terminate()
        const { ok, activity, error } = event.data as { ok?: boolean; activity?: ParsedActivity; error?: string }
        if (ok && activity) {
          resolve(activity)
          return
        }
        reject(new Error(error ?? 'This GPX file could not be read.'))
      }
      worker.onerror = () => {
        worker.terminate()
        reject(new Error('This GPX file could not be read.'))
      }
      worker.postMessage({ xmlText: String(reader.result ?? '') })
    }
    reader.onerror = () => reject(new Error('This GPX file could not be read.'))
    reader.readAsText(file)
  })
}

function App() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const riderMarkerRef = useRef<maplibregl.Marker | null>(null)
  const exportAbortRef = useRef(false)
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [activity, setActivity] = useState<ParsedActivity | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('Load a GPX to export your ride.')
  const [playbackTime, setPlaybackTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const mp4ApiAvailable = typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined'

  const routeDuration = Math.max(settings.duration - END_SCREEN_DURATION, 1)
  const totalPlaybackDuration = settings.duration
  const isEndScreen = playbackTime >= routeDuration

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  }, [settings])

  useEffect(() => {
    const map = mapRef.current
    if (!mapContainerRef.current || map) return

    const mapOptions = {
      container: mapContainerRef.current,
      style: standardMapStyle as unknown as maplibregl.StyleSpecification,
      center: [-122.431, 37.773],
      zoom: 10,
      attributionControl: { compact: true },
      canvasContextAttributes: {
        preserveDrawingBuffer: true,
      },
    } as maplibregl.MapOptions

    const mapInstance = new maplibregl.Map(mapOptions)
    mapInstance.setPixelRatio(Math.min(window.devicePixelRatio || 1, 4))
    mapInstance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = mapInstance

    mapInstance.on('load', () => {
      mapInstance.resize()
      mapInstance.setPixelRatio(Math.min(window.devicePixelRatio || 1, 4))
    })

    return () => {
      mapInstance.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.setStyle(settings.mapStyle === 'satellite' ? (satelliteMapStyle as unknown as maplibregl.StyleSpecification) : (standardMapStyle as unknown as maplibregl.StyleSpecification))
  }, [settings.mapStyle])

  useEffect(() => {
    mapRef.current?.resize()
  }, [settings.resolution])

  const renderedRoute = useMemo(() => {
    if (!activity || activity.points.length === 0) return null

    if (isEndScreen) {
      const coords = activity.points.map((point) => [point.lon, point.lat] as [number, number])
      return {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} }],
      }
    }

    const progress = Math.min(1, playbackTime / Math.max(routeDuration, 1))
    const targetMovingTime = activity.hasTime && activity.totalMovingTimeSeconds > 0
      ? progress * activity.totalMovingTimeSeconds
      : progress * Math.max(activity.points.length - 1, 0)

    const currentPointForRoute = activity.hasTime && activity.totalMovingTimeSeconds > 0
      ? findPointAtMovingTime(activity.points, targetMovingTime)
      : activity.points[Math.min(activity.points.length - 1, Math.max(0, Math.floor(targetMovingTime)))]

    const routeIndex = currentPointForRoute ? activity.points.findIndex((point) => point === currentPointForRoute) : 0
    const visibleRouteLength = Math.max(2, routeIndex + 1)
    const coords = activity.points.slice(0, Math.min(activity.points.length, visibleRouteLength)).map((point) => [point.lon, point.lat] as [number, number])

    return {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} }],
    }
  }, [activity, playbackTime, routeDuration, isEndScreen])

  const currentPoint = useMemo(() => {
    if (!activity || activity.points.length === 0) return null
    if (isEndScreen) return activity.points[activity.points.length - 1]

    const progress = Math.min(1, playbackTime / Math.max(routeDuration, 1))
    const targetMovingTime = activity.hasTime && activity.totalMovingTimeSeconds > 0
      ? progress * activity.totalMovingTimeSeconds
      : progress * Math.max(activity.points.length - 1, 0)

    if (activity.hasTime && activity.totalMovingTimeSeconds > 0) {
      return findPointAtMovingTime(activity.points, targetMovingTime) ?? activity.points[0]
    }

    const index = Math.min(activity.points.length - 1, Math.max(0, Math.round(targetMovingTime)))
    return activity.points[index]
  }, [activity, playbackTime, routeDuration, isEndScreen])

  async function waitForMapReady(map: maplibregl.Map, timeoutMs = 15000): Promise<void> {
    if (map.isStyleLoaded() && map.areTilesLoaded()) {
      return
    }

    await new Promise<void>((resolve) => {
      let settled = false
      let timeoutId: number | undefined

      const cleanup = () => {
        map.off('load', onReady)
        map.off('idle', onReady)
        map.off('error', onReady)
        if (timeoutId !== undefined) {
          window.clearTimeout(timeoutId)
        }
      }

      const onReady = () => {
        if (settled) return
        settled = true
        cleanup()
        resolve()
      }

      map.once('load', onReady)
      map.once('idle', onReady)
      map.once('error', onReady)
      timeoutId = window.setTimeout(onReady, timeoutMs)
    })
  }

  async function waitForMapRender(map: maplibregl.Map, timeoutMs = 15000): Promise<void> {
    await new Promise<void>((resolve) => {
      let settled = false
      const timeoutId = window.setTimeout(finish, timeoutMs)

      function finish() {
        if (settled) return
        settled = true
        window.clearTimeout(timeoutId)
        map.off('idle', finish)
        resolve()
      }

      map.once('idle', finish)
      map.triggerRepaint()
    })
  }

  useEffect(() => {
    const map = mapRef.current
    if (!map || !renderedRoute) return

    const ensureRoute = () => {
      if (!map.isStyleLoaded()) return

      const source = map.getSource('route-source') as maplibregl.GeoJSONSource | undefined
      if (!source) {
        map.addSource('route-source', {
          type: 'geojson',
          data: renderedRoute,
        })
        map.addLayer({
          id: 'route-glow',
          type: 'line',
          source: 'route-source',
          paint: {
            'line-color': '#FFB899',
            'line-width': 10,
            'line-opacity': 0.6,
          },
        })
        map.addLayer({
          id: 'route-main',
          type: 'line',
          source: 'route-source',
          paint: {
            'line-color': '#FC4C02',
            'line-width': 5,
          },
        })
      } else {
        source.setData(renderedRoute)
      }

      if (currentPoint) {
        const pointLocation = [currentPoint.lon, currentPoint.lat] as [number, number]
        if (!riderMarkerRef.current) {
          riderMarkerRef.current = new maplibregl.Marker({ color: '#FC4C02', scale: 0.85 }).setLngLat(pointLocation).addTo(map)
        } else {
          riderMarkerRef.current.setLngLat(pointLocation)
        }
      }
    }

    map.on('styledata', ensureRoute)
    if (map.isStyleLoaded()) {
      ensureRoute()
    }

    if (activity && activity.points.length > 1) {
      const coordinates = activity.points.map((point) => [point.lon, point.lat] as [number, number])
      const bounds = new maplibregl.LngLatBounds(coordinates[0], coordinates[0])
      for (const coord of coordinates) {
        bounds.extend(coord)
      }

      if (isEndScreen) {
        map.fitBounds(bounds, { padding: 70, maxZoom: 11, duration: 1200 })
      } else if (currentPoint) {
        const center: [number, number] = [currentPoint.lon, currentPoint.lat]
        map.easeTo({
          center,
          zoom: 13,
          duration: 350,
          essential: true,
        })
      }
    }
    return () => {
      map.off('styledata', ensureRoute)
    }
  }, [activity, currentPoint, renderedRoute, isEndScreen, settings.mapStyle])

  useEffect(() => {
    if (!activity || !isPlaying) return

    let animationFrame = 0
    let previousTime = performance.now()

    const tick = (now: number) => {
      const deltaSeconds = (now - previousTime) / 1000
      previousTime = now
      setPlaybackTime((previousValue) => {
        const nextValue = previousValue + deltaSeconds
        if (nextValue >= totalPlaybackDuration) {
          setIsPlaying(false)
          return totalPlaybackDuration
        }
        return nextValue
      })
      animationFrame = window.requestAnimationFrame(tick)
    }

    animationFrame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [activity, isPlaying, totalPlaybackDuration])

  async function handleFile(file: File | null) {
    if (!file) return

    const isValid = file.name.toLowerCase().endsWith('.gpx')
    if (!isValid) {
      setError('Please choose a GPX file.')
      return
    }

    setError(null)
    setStatus('Parsing your GPX file…')
    setIsPlaying(false)
    setDownloadUrl(null)

    try {
      const parsed = await readActivityFromFile(file)
      setActivity(parsed)
      setPlaybackTime(0)
      setStatus(parsed.hasTime ? 'Activity ready. Export when ready.' : 'No timestamps found. Using simulated constant speed.')
      if (!parsed.hasTime) {
        setError('No timestamps found. Using simulated constant speed.')
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'This GPX file could not be read.')
      setActivity(null)
      setStatus('Unable to load this file.')
    }
  }

  async function exportVideo() {
    if (!activity) return

    const width = settings.resolution === '720p' ? 720 : 1080
    const height = settings.resolution === '720p' ? 1280 : 1920
    const map = mapRef.current

    if (!map) {
      setError('Map is not ready yet.')
      return
    }

    map.setPixelRatio(Math.min(window.devicePixelRatio || 1, 4))
    map.resize()

    await waitForMapReady(map, 15000).catch((error) => {
      setError(error instanceof Error ? error.message : 'The map is not ready for export yet.')
      setIsExporting(false)
      throw error
    })

    const routeBounds = new maplibregl.LngLatBounds(
      [activity.points[0].lon, activity.points[0].lat],
      [activity.points[0].lon, activity.points[0].lat],
    )
    for (const entry of activity.points) {
      routeBounds.extend([entry.lon, entry.lat])
    }

    const mapWidth = map.getContainer().clientWidth
    const mapHeight = map.getContainer().clientHeight
    const endScreenHorizontalPadding = mapWidth * 0.25 + 70
    const endScreenVerticalPadding = mapHeight * 0.25 + 70

    setStatus('Downloading map tiles…')
    await preloadMapTiles(activity.points, settings.mapStyle, mapWidth, mapHeight)
    setStatus('Preparing map view…')
    map.fitBounds(routeBounds, {
      padding: {
        top: endScreenVerticalPadding,
        right: endScreenHorizontalPadding,
        bottom: endScreenVerticalPadding,
        left: endScreenHorizontalPadding,
      },
      maxZoom: 11,
      duration: 0,
    })
    await waitForMapReady(map, 15000)
    await waitForMapRender(map, 15000)
    const endScreenSnapshot = document.createElement('canvas')
    const endScreenMapCanvas = map.getCanvas()
    endScreenSnapshot.width = endScreenMapCanvas.width
    endScreenSnapshot.height = endScreenMapCanvas.height
    endScreenSnapshot.getContext('2d')?.drawImage(endScreenMapCanvas, 0, 0)

    const preloadStep = Math.max(1, Math.floor(activity.points.length / 40))
    for (let index = 0; index < activity.points.length; index += preloadStep) {
      const entry = activity.points[index]
      map.jumpTo({ center: [entry.lon, entry.lat], zoom: VIDEO_TRACKING_ZOOM })
      await waitForMapReady(map, 10000)
    }

    const firstPoint = activity.points[0]
    map.jumpTo({ center: [firstPoint.lon, firstPoint.lat], zoom: VIDEO_TRACKING_ZOOM })
    await waitForMapReady(map, 15000)

    // Prime the tile cache at the same zoom used while following the rider.
    await waitForMapReady(map, 15000)

    setIsExporting(true)
    setExportProgress(0)
    exportAbortRef.current = false

    const exportCanvas = document.createElement('canvas')
    exportCanvas.width = width
    exportCanvas.height = height
    const ctx = exportCanvas.getContext('2d')
    if (!ctx) {
      setError('Video export failed. Please try again.')
      setIsExporting(false)
      return
    }

    let useMp4 = settings.exportFormat === 'mp4' && typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined'
    let muxer: Muxer<ArrayBufferTarget> | null = null
    let muxerTarget: ArrayBufferTarget | null = null
    let encoder: VideoEncoder | null = null
    let recorder: MediaRecorder | null = null
    const chunks: BlobPart[] = []

    if (useMp4) {
      try {
        muxerTarget = new ArrayBufferTarget()
        muxer = new Muxer({
          target: muxerTarget,
          video: { codec: 'avc', width, height, frameRate: settings.frameRate },
          fastStart: 'in-memory',
        })
        encoder = new VideoEncoder({
          output: (chunk, metadata) => muxer?.addVideoChunk(chunk, metadata),
          error: () => {
            useMp4 = false
          },
        })
        encoder.configure({
          codec: 'avc1.42001f',
          width,
          height,
          bitrate: 6_000_000,
          framerate: settings.frameRate,
        })
      } catch {
        useMp4 = false
        encoder?.close()
        encoder = null
        muxer = null
        muxerTarget = null
      }
    }

    if (!useMp4) {
      setStatus('Rendering video…')
      const stream = exportCanvas.captureStream(settings.frameRate)
      recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' })
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }
    } else {
      setStatus('Rendering MP4…')
    }

    const completeDownload = (blob: Blob, extension: string) => {
      const fileName = `${sanitizeTitle(activity.title)}.${extension}`
      const url = URL.createObjectURL(blob)
      setDownloadUrl(url)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = fileName
      anchor.click()
      setStatus('Export complete. Download started.')
      setIsExporting(false)
    }

    let cancelled = false

    if (recorder) {
      recorder.onstop = () => {
        if (cancelled || exportAbortRef.current) {
          setStatus('Export cancelled.')
          setIsExporting(false)
          setDownloadUrl(null)
          return
        }

        completeDownload(new Blob(chunks, { type: 'video/webm' }), 'webm')
      }
    }

    const totalFrames = Math.max(1, Math.ceil(totalPlaybackDuration * settings.frameRate))
    recorder?.start()
    const exportStartTime = performance.now()
    const frameIntervalMs = 1000 / settings.frameRate
    let smoothedOverlayDistance = 0
    let smoothedOverlaySpeed = 0
    let displayedOverlayDistance = 0
    let displayedOverlaySpeed = 0
    const overlayUpdateInterval = Math.max(1, Math.round(settings.frameRate / 6))

    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
      if (exportAbortRef.current) {
        cancelled = true
        recorder?.stop()
        break
      }

      const frameTargetTime = frameIndex * frameIntervalMs
      const waitTime = frameTargetTime - (performance.now() - exportStartTime)
      if (waitTime > 0) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, waitTime))
      }

      const timeAtFrame = (frameIndex / totalFrames) * totalPlaybackDuration
      const frameProgress = Math.min(1, timeAtFrame / Math.max(routeDuration, 1))
      const isFrameEndScreen = timeAtFrame >= routeDuration
      const targetMovingTime = activity.hasTime && activity.totalMovingTimeSeconds > 0
        ? frameProgress * activity.totalMovingTimeSeconds
        : frameProgress * Math.max(activity.points.length - 1, 0)
      const point = isFrameEndScreen
        ? activity.points[activity.points.length - 1]
        : (findPointAtMovingTime(activity.points, targetMovingTime) ?? activity.points[0])

      const targetOverlayDistance = activity.totalDistanceMeters * frameProgress
      const targetOverlaySpeed = Math.max(point.speed || (!activity.hasTime ? activity.totalDistanceMeters / settings.duration : 0), 0)
      smoothedOverlayDistance += (targetOverlayDistance - smoothedOverlayDistance) * 0.08
      smoothedOverlaySpeed += (targetOverlaySpeed - smoothedOverlaySpeed) * 0.08
      if (frameIndex % overlayUpdateInterval === 0) {
        displayedOverlayDistance = smoothedOverlayDistance
        displayedOverlaySpeed = smoothedOverlaySpeed
      }

      setExportProgress(Math.round((frameIndex / totalFrames) * 100))

      const visibleRouteEndIndex = activity.points.findIndex((entry) => entry === point)
      const routeCoords = getExportRouteCoords(activity.points, visibleRouteEndIndex, isFrameEndScreen)

      if (!isFrameEndScreen) {
        map.jumpTo({ center: [point.lon, point.lat], zoom: VIDEO_TRACKING_ZOOM })
      } else {
        map.fitBounds(routeBounds, {
          padding: {
            top: endScreenVerticalPadding,
            right: endScreenHorizontalPadding,
            bottom: endScreenVerticalPadding,
            left: endScreenHorizontalPadding,
          },
          maxZoom: 11,
          duration: 0,
        })
      }

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          map.triggerRepaint()
          const mapCanvas = map.getCanvas()
          const sourceMapCanvas = isFrameEndScreen ? endScreenSnapshot : mapCanvas
          const mapCssWidth = map.getContainer().clientWidth
          const mapCssHeight = map.getContainer().clientHeight
          const cropX = mapCssWidth * 0.25
          const cropY = mapCssHeight * 0.25
          const cropWidth = mapCssWidth * 0.5
          const cropHeight = mapCssHeight * 0.5
          const canvasScaleX = sourceMapCanvas.width / mapCssWidth
          const canvasScaleY = sourceMapCanvas.height / mapCssHeight
          const mapAspect = cropWidth / Math.max(cropHeight, 1)
          const outputAspect = width / height

          ctx.clearRect(0, 0, width, height)
          ctx.fillStyle = '#F7F7F7'
          ctx.fillRect(0, 0, width, height)

          let drawWidth = width
          let drawHeight = height
          let offsetX = 0
          let offsetY = 0

          if (mapAspect >= outputAspect) {
            drawHeight = height
            drawWidth = drawHeight * mapAspect
            offsetX = (width - drawWidth) / 2
          } else {
            drawWidth = width
            drawHeight = drawWidth / mapAspect
            offsetY = (height - drawHeight) / 2
          }

          ctx.imageSmoothingEnabled = true
          ctx.drawImage(
            sourceMapCanvas,
            cropX * canvasScaleX,
            cropY * canvasScaleY,
            cropWidth * canvasScaleX,
            cropHeight * canvasScaleY,
            offsetX,
            offsetY,
            drawWidth,
            drawHeight,
          )
          drawRouteOnCanvas(ctx, routeCoords, map, drawWidth, drawHeight, offsetX, offsetY, cropX, cropY, cropWidth, cropHeight)

          const projected = map.project([point.lon, point.lat])
          const riderMarkerX = offsetX + ((projected.x - cropX) / cropWidth) * drawWidth
          const riderMarkerY = offsetY + ((projected.y - cropY) / cropHeight) * drawHeight
          drawRiderMarkerOnCanvas(ctx, riderMarkerX, riderMarkerY, 16)

          const overlayMargin = width * 0.06
          const overlayWidth = width - overlayMargin * 2
          const overlayHeight = 190
          const overlayTop = height - overlayHeight - width * 0.07
          drawVideoPanel(ctx, overlayMargin, overlayTop, overlayWidth, overlayHeight)
          ctx.fillStyle = 'rgba(255, 255, 255, 0.62)'
          ctx.font = '600 22px sans-serif'
          ctx.fillText('RIDE PROGRESS', overlayMargin + 32, overlayTop + 44)
          ctx.fillStyle = '#fff'
          ctx.font = '700 52px sans-serif'
          ctx.fillText(formatDistance(displayedOverlayDistance, settings.units), overlayMargin + 32, overlayTop + 102)
          ctx.fillStyle = '#FFB899'
          ctx.font = '600 52px sans-serif'
          ctx.fillText(formatSpeed(displayedOverlaySpeed, settings.units), overlayMargin + 32, overlayTop + 164)
          const attributionText = settings.mapStyle === 'satellite' ? '© Esri' : '© OpenStreetMap contributors'
          ctx.fillStyle = 'rgba(255, 255, 255, 0.82)'
          ctx.font = '18px sans-serif'
          ctx.fillText(attributionText, width - 260, height - 28)

          if (isFrameEndScreen) {
            const summaryX = width * 0.07
            const summaryY = height * 0.1 - 50
            const summaryWidth = width * 0.86
            const summaryHeight = height * 0.72
            drawVideoPanel(ctx, summaryX, summaryY, summaryWidth, summaryHeight, 'rgba(15, 23, 42, 0.68)')
            ctx.fillStyle = '#FFB899'
            ctx.font = '700 26px sans-serif'
            ctx.fillText('ACTIVITY COMPLETE', summaryX + 44, summaryY + 58)
            ctx.fillStyle = '#fff'
            ctx.font = '700 62px sans-serif'
            ctx.fillText(activity.title.slice(0, 26), summaryX + 44, summaryY + 132)
            ctx.fillStyle = 'rgba(255, 255, 255, 0.68)'
            ctx.font = '28px sans-serif'
            if (activity.date) {
              ctx.fillText(new Date(activity.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }), summaryX + 44, summaryY + 178)
            }
            const statStartY = summaryY + summaryHeight - 260
            const statRowHeight = 72
            const statLabelFontSize = Math.max(18, Math.min(26, summaryWidth / 28))
            const statValueFontSize = Math.max(30, Math.min(44, summaryWidth / 16))
            const summaryStats = [
              ['DISTANCE', formatDistance(activity.totalDistanceMeters, settings.units)],
              ['AVERAGE SPEED', formatSpeed(activity.totalMovingTimeSeconds > 0 ? activity.totalDistanceMeters / activity.totalMovingTimeSeconds : 0, settings.units)],
              ['MOVING TIME', formatMovingTime(activity.totalMovingTimeSeconds)],
            ]
            summaryStats.forEach(([label, value], index) => {
              const statY = statStartY + index * statRowHeight
              ctx.fillStyle = 'rgba(255, 255, 255, 0.58)'
              ctx.font = `600 ${statLabelFontSize}px sans-serif`
              ctx.textAlign = 'left'
              ctx.fillText(label, summaryX + 44, statY)
              ctx.fillStyle = '#fff'
              ctx.font = `700 ${statValueFontSize}px sans-serif`
              ctx.textAlign = 'right'
              ctx.fillText(value, summaryX + summaryWidth - 44, statY)
              if (index < summaryStats.length - 1) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.16)'
                ctx.fillRect(summaryX + 44, statY + 22, summaryWidth - 88, 1)
              }
            })
            ctx.textAlign = 'left'
          }

          if (useMp4 && encoder) {
            const videoFrame = new VideoFrame(exportCanvas, {
              timestamp: Math.round((frameIndex * 1_000_000) / settings.frameRate),
              duration: Math.round(1_000_000 / settings.frameRate),
            })
            encoder.encode(videoFrame, { keyFrame: frameIndex === 0 || frameIndex % (settings.frameRate * 2) === 0 })
            videoFrame.close()
          }

          resolve()
        })
      })

      if (useMp4 && encoder) {
        while (encoder.encodeQueueSize > 4) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
        }
      }
    }

    if (useMp4 && encoder && muxer && muxerTarget) {
      if (cancelled) {
        encoder.close()
        setStatus('Export cancelled.')
        setIsExporting(false)
        setDownloadUrl(null)
        return
      }

      await encoder.flush()
      encoder.close()
      muxer.finalize()
      completeDownload(new Blob([muxerTarget.buffer], { type: 'video/mp4' }), 'mp4')
    } else {
      recorder?.stop()
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    void handleFile(file)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Turn your GPX into a route replay video.</p>
          <h1>VeloTrace</h1>
        </div>
      </header>

      <main className="content-grid">
        <section className="panel upload-panel">
          <div className="panel-header">
            <h2>Upload activity</h2>
          </div>

          <div
            className="dropzone"
            onDrop={handleDrop}
            onDragOver={(event) => event.preventDefault()}
          >
            <p className="dropzone-title">Drop a GPX file here</p>
            <label className="primary-button">Browse files
              <input
                type="file"
                accept=".gpx"
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  const file = event.target.files?.[0] ?? null
                  event.target.value = ''
                  void handleFile(file)
                }}
              />
            </label>
            <small>Supported format: GPX · Video is generated locally · No account required</small>
          </div>

          <p className="trust-note">Your file is processed locally in your browser.</p>

          {error ? <div className="message error">{error}</div> : null}
          {status ? <div className="message info">{status}</div> : null}
        </section>

        <section className="panel settings-panel">
          <div className="panel-header">
            <h2>Settings</h2>
          </div>

          <div className="settings-grid">
            <label>
              Duration
              <select value={settings.duration} onChange={(event) => setSettings({ ...settings, duration: Number(event.target.value) as DurationOption })}>
                {[15, 30, 45, 60].map((value) => (
                  <option key={value} value={value}>{value}s</option>
                ))}
              </select>
            </label>

            <label>
              Export format
              <select value={settings.exportFormat} onChange={(event) => setSettings({ ...settings, exportFormat: event.target.value as ExportFormatOption })}>
                <option value="mp4" disabled={!mp4ApiAvailable}>MP4{mp4ApiAvailable ? '' : ' (not supported)'}</option>
                <option value="webm">WebM</option>
              </select>
            </label>

            <label>
              Map style
              <select value={settings.mapStyle} onChange={(event) => setSettings({ ...settings, mapStyle: event.target.value as MapStyleOption })}>
                <option value="standard">Standard</option>
                <option value="satellite">Satellite</option>
              </select>
            </label>

            <label>
              Units
              <select value={settings.units} onChange={(event) => setSettings({ ...settings, units: event.target.value as UnitOption })}>
                <option value="metric">Metric</option>
                <option value="imperial">Imperial</option>
              </select>
            </label>
          </div>
        </section>

        <div
          className="export-map-source"
          ref={mapContainerRef}
          aria-hidden="true"
          style={{
            width: settings.resolution === '720p' ? 1440 : 2160,
            height: settings.resolution === '720p' ? 2560 : 3840,
          }}
        />

        <section className="panel export-panel">
          <div className="panel-header">
            <h2>Export</h2>
          </div>

          <button type="button" className="primary-button wide" onClick={() => void exportVideo()} disabled={!activity || isExporting}>
            {isExporting ? 'Rendering…' : 'Export video'}
          </button>

          {isExporting ? (
            <div className="export-progress">
              <div className="progress-strip">
                <span style={{ width: `${exportProgress}%` }} />
              </div>
              <small>{exportProgress}%</small>
              <button type="button" className="secondary-button" onClick={() => {
                exportAbortRef.current = true
                setStatus('Cancelling export…')
              }}>
                Cancel
              </button>
            </div>
          ) : null}

          {downloadUrl ? (
            <a className="download-link" href={downloadUrl} download>
              Download video
            </a>
          ) : null}
        </section>
      </main>
    </div>
  )
}

export default App
