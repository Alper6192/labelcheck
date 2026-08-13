import test from "node:test";
import assert from "node:assert/strict";
import { isVerifiedRearTrack, rearCameraConstraints } from "../src/camera.js";

test("Kamera fordert die Rückkamera hart als environment an", () => {
  const constraints = rearCameraConstraints();
  assert.equal(constraints.audio, false);
  assert.equal(constraints.video.facingMode.exact, "environment");
});

test("Frontkamera wird nicht als Rückkamera akzeptiert", () => {
  const front = { label: "Front Camera", getSettings: () => ({ facingMode: "user" }) };
  assert.equal(isVerifiedRearTrack(front), false);
});

test("Rückkamera wird über facingMode oder Label erkannt", () => {
  assert.equal(isVerifiedRearTrack({ label: "", getSettings: () => ({ facingMode: "environment" }) }), true);
  assert.equal(isVerifiedRearTrack({ label: "Back Camera", getSettings: () => ({}) }), true);
});
