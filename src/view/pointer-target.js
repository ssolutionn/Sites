/** Distance in fractions of viewport height, independent of camera depth and aspect. */
export function screenGestureHit(pointer,center,aspect,radius) {
  if (!pointer || !center || center.z < -1 || center.z > 1) return false;
  return Math.hypot((pointer.x-center.x)*aspect,pointer.y-center.y)/2 <= radius;
}
