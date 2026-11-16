import type { AabbCollisionResult } from './mapData';

export const BHOP_GRACE_SECONDS = 0.15; // 150ms landing grace window
export const BHOP_MAX_MULT = 2.2;
export const BHOP_CHAIN_STEP = 0.14;

export interface KrunkerMoveState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  grounded: boolean;
  landingGraceTimer: number;
  bhopStreak: number;
  jumpBufferTimer: number;
  coyoteTimer: number;
  prevJumpHeld: boolean;
}

export interface KrunkerMoveInput {
  yaw: number;
  wishFwd: number;
  wishStrafe: number;
  jumpHeld: boolean;
  crouchHeld: boolean;
  walkHeld: boolean;
  baseRunSpeed: number;
  scopeZoom: 0 | 1 | 2;
  isFrozen: boolean;
  radius: number;
}

export interface KrunkerMoveStepEvents {
  jumped: boolean;
  bhopped: boolean;
  landed: boolean;
  landingImpactSpeed: number;
  horizSpeed: number;
  speedMult: number;
}

export type CollisionResolverFn = (
  x: number,
  y: number,
  z: number,
  vy: number,
  radius: number,
  height: number
) => AabbCollisionResult;

export function createKrunkerMoveState(
  x = 0,
  y = 0,
  z = 0
): KrunkerMoveState {
  return {
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    grounded: true,
    landingGraceTimer: 0,
    bhopStreak: 0,
    jumpBufferTimer: 0,
    coyoteTimer: 0,
    prevJumpHeld: false,
  };
}

function applyAirStrafeAccelerate(
  vx: number,
  vz: number,
  wishX: number,
  wishZ: number,
  wishSpeed: number,
  accel: number,
  dt: number
): [number, number] {
  if (wishSpeed <= 0.001) return [vx, vz];
  // Cap air wishspeed low (~2.2) so turning smoothly in mid-air curves momentum without bleeding speed
  const cappedWish = Math.min(wishSpeed, 2.25);
  const currentProj = vx * wishX + vz * wishZ;
  const addSpeed = cappedWish - currentProj;
  if (addSpeed <= 0) return [vx, vz];
  const accelSpeed = Math.min(accel * wishSpeed * dt, addSpeed);
  return [vx + accelSpeed * wishX, vz + accelSpeed * wishZ];
}

export function stepKrunkerMovement(
  state: KrunkerMoveState,
  input: KrunkerMoveInput,
  resolveCollision: CollisionResolverFn,
  rawDt: number
): KrunkerMoveStepEvents {
  const dt = Math.min(Math.max(rawDt, 0.0005), 0.05);
  const wasGrounded = state.grounded;
  const preVy = state.vy;

  const jumpEdge = input.jumpHeld && !state.prevJumpHeld;
  state.prevJumpHeld = input.jumpHeld;

  if (jumpEdge && !input.isFrozen) {
    state.jumpBufferTimer = 0.12;
  } else {
    state.jumpBufferTimer = Math.max(0, state.jumpBufferTimer - dt);
  }

  if (state.grounded) {
    state.coyoteTimer = 0.08;
    if (state.landingGraceTimer > 0) {
      state.landingGraceTimer = Math.max(0, state.landingGraceTimer - dt);
      if (state.landingGraceTimer <= 0 && !input.crouchHeld) {
        state.bhopStreak = 0;
      }
    } else if (!input.crouchHeld) {
      state.bhopStreak = 0;
    }
  } else {
    state.coyoteTimer = Math.max(0, state.coyoteTimer - dt);
  }

  const effectiveRunSpeed = Math.max(2.0, input.baseRunSpeed);
  let targetGroundSpeed = effectiveRunSpeed;
  if (input.crouchHeld) targetGroundSpeed *= 0.54;
  else if (input.walkHeld) targetGroundSpeed *= 0.56;
  if (input.scopeZoom > 0) targetGroundSpeed *= 0.58;

  const fx = -Math.sin(input.yaw);
  const fz = -Math.cos(input.yaw);
  const rx = Math.cos(input.yaw);
  const rz = -Math.sin(input.yaw);

  let wishX = input.isFrozen ? 0 : fx * input.wishFwd + rx * input.wishStrafe;
  let wishZ = input.isFrozen ? 0 : fz * input.wishFwd + rz * input.wishStrafe;
  const wishLen = Math.hypot(wishX, wishZ);
  if (wishLen > 0.001) {
    wishX /= wishLen;
    wishZ /= wishLen;
  }

  // Ground vs Air velocity update (dt-independent exponential damping + air-strafe curve)
  if (state.grounded) {
    const inGrace = state.landingGraceTimer > 0;
    if (inGrace) {
      // Preserve momentum during 150ms landing grace window so chained bhops don't lose speed!
      const slideDamp = Math.exp(-(input.crouchHeld ? 1.8 : 3.2) * dt);
      state.vx *= slideDamp;
      state.vz *= slideDamp;
      if (wishLen > 0.001) {
        const blend = 1 - Math.exp(-8 * dt);
        const curSpd = Math.max(Math.hypot(state.vx, state.vz), targetGroundSpeed);
        state.vx = state.vx + (wishX * curSpd - state.vx) * blend;
        state.vz = state.vz + (wishZ * curSpd - state.vz) * blend;
      }
    } else if (input.crouchHeld && Math.hypot(state.vx, state.vz) > effectiveRunSpeed * 0.92) {
      // Crouch-slide carry on landing
      const slideFriction = Math.exp(-3.4 * dt);
      state.vx *= slideFriction;
      state.vz *= slideFriction;
    } else {
      const groundAccel = wishLen > 0.001 ? 16.5 : 15.0;
      const alpha = 1 - Math.exp(-groundAccel * dt);
      state.vx = state.vx + (wishX * targetGroundSpeed - state.vx) * alpha;
      state.vz = state.vz + (wishZ * targetGroundSpeed - state.vz) * alpha;
      if (wishLen <= 0.001 && Math.hypot(state.vx, state.vz) < 0.25) {
        state.vx = 0;
        state.vz = 0;
      }
    }
  } else {
    // Mid-air Krunker-style responsive air-strafing
    const [nvx, nvz] = applyAirStrafeAccelerate(
      state.vx,
      state.vz,
      wishX,
      wishZ,
      effectiveRunSpeed,
      14.5,
      dt
    );
    state.vx = nvx;
    state.vz = nvz;
  }

  // Trigger Jump / Chained Bhop
  let jumped = false;
  let bhopped = false;
  const canJump = state.grounded || state.coyoteTimer > 0;
  const wantJump = !input.isFrozen && (jumpEdge || state.jumpBufferTimer > 0 || (input.jumpHeld && state.landingGraceTimer > 0));

  if (canJump && wantJump) {
    const isBhopChain =
      state.landingGraceTimer > 0 ||
      (!wasGrounded && state.coyoteTimer <= 0) ||
      Math.hypot(state.vx, state.vz) >= effectiveRunSpeed * 0.92;

    if (isBhopChain && (state.landingGraceTimer > 0 || state.bhopStreak > 0)) {
      state.bhopStreak = Math.min(12, state.bhopStreak + 1);
      bhopped = true;
    } else {
      state.bhopStreak = 0;
    }

    const mult = Math.min(BHOP_MAX_MULT, 1 + state.bhopStreak * BHOP_CHAIN_STEP);
    const maxCap = effectiveRunSpeed * BHOP_MAX_MULT;
    const minChainSpeed = Math.min(maxCap, effectiveRunSpeed * mult);
    const curHoriz = Math.hypot(state.vx, state.vz);

    if (curHoriz > 0.25) {
      const targetSpd = Math.min(maxCap, Math.max(curHoriz, minChainSpeed));
      // Blend slightly toward current wish direction on takeoff so directional bhops feel crisp
      let dirX = state.vx / curHoriz;
      let dirZ = state.vz / curHoriz;
      if (wishLen > 0.001) {
        dirX = dirX * 0.72 + wishX * 0.28;
        dirZ = dirZ * 0.72 + wishZ * 0.28;
        const nLen = Math.hypot(dirX, dirZ) || 1;
        dirX /= nLen;
        dirZ /= nLen;
      }
      state.vx = dirX * targetSpd;
      state.vz = dirZ * targetSpd;
    } else if (wishLen > 0.001) {
      state.vx = wishX * minChainSpeed;
      state.vz = wishZ * minChainSpeed;
    }

    state.vy = 6.75;
    state.grounded = false;
    state.landingGraceTimer = 0;
    state.jumpBufferTimer = 0;
    state.coyoteTimer = 0;
    jumped = true;
  }

  // Gravity + mid-air crouch fast-fall
  const gravity = !state.grounded && input.crouchHeld && !input.isFrozen ? 29.5 : 19.2;
  state.vy -= gravity * dt;

  // Sub-stepped collision resolution to prevent high-speed clipping through walls/ramps/crates
  const actorHeight = input.crouchHeld ? 1.3 : 1.85;
  const totalDx = state.vx * dt;
  const totalDy = state.vy * dt;
  const totalDz = state.vz * dt;
  const travel = Math.hypot(totalDx, totalDy, totalDz);
  const substeps = Math.max(1, Math.min(6, Math.ceil(travel / 0.22)));
  const stepDx = totalDx / substeps;
  const stepDy = totalDy / substeps;
  const stepDz = totalDz / substeps;

  let colResult: AabbCollisionResult = {
    x: state.x,
    y: state.y,
    z: state.z,
    grounded: state.grounded,
    groundY: state.y,
  };

  for (let s = 0; s < substeps; s++) {
    colResult = resolveCollision(
      state.x + stepDx,
      state.y + stepDy,
      state.z + stepDz,
      state.vy,
      input.radius,
      actorHeight
    );
    state.x = colResult.x;
    state.y = colResult.y;
    state.z = colResult.z;
    if (colResult.grounded && state.vy < 0) {
      state.vy = 0;
    }
  }

  state.grounded = colResult.grounded;
  if (state.grounded && state.vy < 0) {
    state.vy = 0;
  }

  let landed = false;
  let landingImpactSpeed = 0;
  if (!wasGrounded && state.grounded && preVy < -1.5) {
    landed = true;
    landingImpactSpeed = Math.abs(preVy);
    state.landingGraceTimer = BHOP_GRACE_SECONDS;
  }

  // Hard clamp overall horizontal speed safety cap at 2.2x base run speed
  const horizSpeed = Math.hypot(state.vx, state.vz);
  const absCap = effectiveRunSpeed * BHOP_MAX_MULT;
  if (horizSpeed > absCap) {
    const scale = absCap / horizSpeed;
    state.vx *= scale;
    state.vz *= scale;
  }

  const finalHoriz = Math.hypot(state.vx, state.vz);
  return {
    jumped,
    bhopped,
    landed,
    landingImpactSpeed,
    horizSpeed: finalHoriz,
    speedMult: finalHoriz / effectiveRunSpeed,
  };
}
