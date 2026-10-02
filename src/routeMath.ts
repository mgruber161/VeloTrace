export type TimedPoint = {
  movingTimeSeconds: number
}

export function findPointAtMovingTime<T extends TimedPoint>(points: T[], targetMovingTime: number): T | null {
  if (points.length === 0) {
    return null
  }

  if (targetMovingTime <= 0) {
    return points[0]
  }

  let selectedIndex = 0
  for (let index = 0; index < points.length; index += 1) {
    if (points[index].movingTimeSeconds <= targetMovingTime) {
      selectedIndex = index
    }
  }

  return points[selectedIndex] ?? points[points.length - 1]
}
