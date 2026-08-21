const SAVED_REAR_CAMERA_KEY = "labelcheck.rearCameraDeviceId";

function mediaDevices(navigatorLike = globalThis.navigator) {
  return navigatorLike?.mediaDevices || null;
}

function savedRearCameraId(storageLike = globalThis.localStorage) {
  try { return storageLike?.getItem?.(SAVED_REAR_CAMERA_KEY) || ""; } catch { return ""; }
}

function rememberRearCameraId(deviceId, storageLike = globalThis.localStorage) {
  if (!deviceId) return;
  try { storageLike?.setItem?.(SAVED_REAR_CAMERA_KEY, deviceId); } catch {}
}

function stopStream(stream) {
  for (const track of stream?.getTracks?.() || []) {
    try { track.stop(); } catch {}
  }
}

function rearLabel(device) {
  return /back|rear|environment|world|rück|hinter/i.test(String(device?.label || ""));
}

async function requestStream(devices, videoConstraints) {
  return devices.getUserMedia({ audio: false, video: videoConstraints });
}

async function findRearDevice(devices) {
  if (!devices?.enumerateDevices) return null;
  try {
    const list = await devices.enumerateDevices();
    return list.find((device) => device.kind === "videoinput" && rearLabel(device)) || null;
  } catch {
    return null;
  }
}

export async function openRearCameraStream({ navigatorLike = globalThis.navigator, storageLike = globalThis.localStorage } = {}) {
  const devices = mediaDevices(navigatorLike);
  if (!devices?.getUserMedia) throw new Error("Die Kamera wird von diesem Browser nicht unterstützt.");

  const savedId = savedRearCameraId(storageLike);
  const attempts = [];
  if (savedId) attempts.push({ deviceId: { exact: savedId }, width: { ideal: 1920 }, height: { ideal: 1080 } });
  attempts.push({ facingMode: { exact: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } });
  attempts.push({ facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } });

  let lastError = null;
  for (const constraints of attempts) {
    let stream = null;
    try {
      stream = await requestStream(devices, constraints);
      const track = stream.getVideoTracks?.()[0];
      const settings = track?.getSettings?.() || {};

      // Falls ein Browser trotz environment ausdrücklich die Selfie-Kamera liefert,
      // versuchen wir nach erteilter Berechtigung noch einmal ein als Rückkamera
      // benanntes Gerät. Eine explizit gemeldete user-facing Kamera akzeptieren wir nie.
      if (settings.facingMode === "user") {
        const rearDevice = await findRearDevice(devices);
        stopStream(stream);
        stream = null;
        if (!rearDevice?.deviceId) throw new Error("Keine Rückkamera verfügbar.");
        stream = await requestStream(devices, {
          deviceId: { exact: rearDevice.deviceId },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        });
      }

      const finalTrack = stream.getVideoTracks?.()[0];
      const finalSettings = finalTrack?.getSettings?.() || {};
      if (finalSettings.facingMode === "user") {
        stopStream(stream);
        throw new Error("Keine Rückkamera verfügbar.");
      }
      rememberRearCameraId(finalSettings.deviceId, storageLike);
      return stream;
    } catch (error) {
      if (stream) stopStream(stream);
      lastError = error;
    }
  }
  throw lastError || new Error("Rückkamera konnte nicht geöffnet werden.");
}

export function stopCameraStream(stream) {
  stopStream(stream);
}

export function isLandscapeViewport(windowLike = globalThis.window) {
  const width = Number(windowLike?.innerWidth || 0);
  const height = Number(windowLike?.innerHeight || 0);
  return width > 0 && height > 0 ? width > height : true;
}

export async function captureVideoFrame(video, { fileName = "label.jpg", documentLike = globalThis.document } = {}) {
  const sourceWidth = Number(video?.videoWidth || 0);
  const sourceHeight = Number(video?.videoHeight || 0);
  if (!sourceWidth || !sourceHeight) throw new Error("Kamerabild ist noch nicht bereit.");

  const rotate = sourceHeight > sourceWidth;
  const canvas = documentLike.createElement("canvas");
  canvas.width = rotate ? sourceHeight : sourceWidth;
  canvas.height = rotate ? sourceWidth : sourceHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Foto konnte nicht erstellt werden.");

  if (rotate) {
    context.translate(canvas.width, 0);
    context.rotate(Math.PI / 2);
    context.drawImage(video, 0, 0, sourceWidth, sourceHeight);
  } else {
    context.drawImage(video, 0, 0, sourceWidth, sourceHeight);
  }

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Foto konnte nicht gespeichert werden.")), "image/jpeg", 0.92);
  });
  return new File([blob], fileName, { type: "image/jpeg", lastModified: Date.now() });
}
