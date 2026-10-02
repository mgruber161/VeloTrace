import assert from 'node:assert/strict'
import { findPointAtMovingTime } from './routeMath.ts'

const points = [
  { movingTimeSeconds: 0 },
  { movingTimeSeconds: 2 },
  { movingTimeSeconds: 4 },
  { movingTimeSeconds: 6 },
  { movingTimeSeconds: 8 },
]

assert.equal(findPointAtMovingTime(points, 0)?.movingTimeSeconds, 0)
assert.equal(findPointAtMovingTime(points, 3)?.movingTimeSeconds, 2)
assert.equal(findPointAtMovingTime(points, 10)?.movingTimeSeconds, 8)

console.log('routeMath regression checks passed')
