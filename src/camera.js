export function rearCameraConstraints() {
  return {
    audio: false,
    video: {
      facingMode: { exact: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    }
  };
}

export async function getRearCameraStream(mediaDevices = globalThis.navigator?.mediaDevices) {
  if (!mediaDevices || typeof mediaDevices.getUserMedia !== "function") {
    throw new Error("Kamerazugriff wird von diesem Browser nicht unterstützt.");
  }

  try {
    // Harte Vorgabe: nur die vom Nutzer weg gerichtete Kamera.
    return await mediaDevices.getUserMedia(rearCameraConstraints());
  } catch (error) {
    // Einige Browser/Devices akzeptieren 'exact' nicht zuverlässig. Als zweiter
    // Versuch darf 'ideal' öffnen, wird aber VOR der Anzeige verifiziert. Eine
    // Frontkamera wird sofort wieder gestoppt und niemals im UI angezeigt.
    if (!isConstraintCompatibilityError(error)) throw error;

    const stream = await mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    });
    const track = stream.getVideoTracks?.()[0];
    if (!isVerifiedRearTrack(track)) {
      stopMediaStream(stream);
      throw new Error("Keine Rückkamera konnte sicher ausgewählt werden.");
    }
    return stream;
  }
}

export function isVerifiedRearTrack(track) {
  if (!track) return false;
  const facingMode = String(track.getSettings?.().facingMode || "").toLowerCase();
  if (facingMode === "environment") return true;
  const label = String(track.label || "").toLowerCase();
  return /(back|rear|environment|rück|rueck|hinten|posteri|traser|arrière|camera 0)/i.test(label);
}

export function stopMediaStream(stream) {
  for (const track of stream?.getTracks?.() || []) {
    try { track.stop(); } catch {}
  }
}

export async function captureRearFrame(video, filename, documentLike = globalThis.document) {
  const width = Number(video?.videoWidth || 0);
  const height = Number(video?.videoHeight || 0);
  if (!width || !height) throw new Error("Kamerabild ist noch nicht bereit.");

  const canvas = documentLike.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Kamerabild konnte nicht verarbeitet werden.");
  context.drawImage(video, 0, 0, width, height);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Foto konnte nicht erstellt werden.")), "image/jpeg", 0.94);
  });
  return new File([blob], filename, { type: "image/jpeg", lastModified: Date.now() });
}

function isConstraintCompatibilityError(error) {
  return ["OverconstrainedError", "NotFoundError", "TypeError"].includes(String(error?.name || ""));
}
