/**
 * The bot's eyes sit on a sphere rather than on the flat face, which is what
 * makes the far one narrower than the near one and the lean read as a turn of
 * the head instead of a rotation of two rectangles. Constants are the ones the
 * x.ai avatar was measured against.
 */
export const EYE_W = 0.186;
export const EYE_H = 0.412;
export const EYE_SPLIT = 15.46;
export const REST_GAZE = { pitch: 28.62, roll: -13, yaw: 28.49 };

/** Where the rest pose puts the pair, as a fraction of the radius. */
const REST_MID = { x: 0.4036, y: 0.4617 };
/** How far the pair may travel from the face's centre before it is held. */
const MAX_DRIFT = 0.17;

export interface Gaze {
  pitch: number;
  roll: number;
  yaw: number;
}

export interface EyePlacement {
  /** Foreshortening across the eye's width; 1 faces the reader head on. */
  squeeze: number;
  tilt: number;
  x: number;
  y: number;
}

const RAD = Math.PI / 180;

export const placeEyes = (gaze: Gaze, radius: number): EyePlacement[] => {
  const y = gaze.yaw * RAD;
  const p = gaze.pitch * RAD;
  const r = gaze.roll * RAD;

  const spin = (v: [number, number, number]): [number, number, number] => {
    const [x0, y0, z0] = v;
    const x1 = x0 * Math.cos(r) - y0 * Math.sin(r);
    const y1 = x0 * Math.sin(r) + y0 * Math.cos(r);
    const y2 = y1 * Math.cos(p) - z0 * Math.sin(p);
    const z2 = y1 * Math.sin(p) + z0 * Math.cos(p);
    const x3 = x1 * Math.cos(y) + z2 * Math.sin(y);
    const z3 = -x1 * Math.sin(y) + z2 * Math.cos(y);
    return [x3, y2, z3];
  };

  // The head's own up axis, projected, is the angle each capsule stands at.
  const [ux, uy] = spin([0, 1, 0]);
  const tilt = Math.atan2(ux, uy) / RAD;

  const one = (side: number): EyePlacement => {
    const a = side * EYE_SPLIT * RAD;
    const [x, yy, z] = spin([Math.sin(a), 0, Math.cos(a)]);
    return { squeeze: Math.max(0.12, z), tilt, x: x * radius, y: -yy * radius };
  };
  const near = one(-1);
  const far = one(1);

  /*
   * The pair is then moved back onto the face as one piece — an isometry, not
   * a per-eye nudge — so the turn keeps showing in the two widths and the lean.
   *
   * The offset is the one the rest pose needs, held fixed, rather than whatever
   * centres the pair on this frame: recomputing it every frame would subtract
   * the very translation that makes a moving gaze visible. A cap on how far the
   * pair may wander is what keeps the eyes clear of the silhouette instead.
   */
  const centreX = (near.x + far.x) / 2;
  const centreY = (near.y + far.y) / 2;
  const driftX = centreX - REST_MID.x * radius;
  const driftY = centreY - REST_MID.y * radius;
  const drift = Math.hypot(driftX, driftY);
  const cap = MAX_DRIFT * radius;
  const hold = drift > cap ? cap / drift : 1;
  const shiftX = driftX * hold - centreX;
  const shiftY = driftY * hold - centreY;

  return [near, far].map((eye) => ({
    ...eye,
    x: eye.x + shiftX,
    y: eye.y + shiftY,
  }));
};
