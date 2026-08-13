/**
 * Hilfsfunktion für native Datei-/Kamera-Inputs. Die App verwendet ab 0.16.14 dauerhaft vorhandene Kamera-Inputs im DOM.
 * capture="environment" bittet den Browser/die Kamera-App ausdrücklich um
 * die nach außen gerichtete Kamera, ohne eine Browser-Kameravorschau zu öffnen.
 */
export function createNativeRearCameraInput(documentLike = globalThis.document) {
  if (!documentLike?.createElement) throw new Error("Kamera-Input konnte nicht erstellt werden.");
  const input = documentLike.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.setAttribute("capture", "environment");
  input.className = "native-file-input native-camera-input";
  input.setAttribute("aria-hidden", "true");
  return input;
}

export function openNativeRearCamera({ key, onFile, documentLike = globalThis.document }) {
  if (!["product", "vda"].includes(key)) return null;
  const input = createNativeRearCameraInput(documentLike);
  documentLike.body.appendChild(input);

  const cleanup = () => {
    try { input.remove(); } catch {}
  };

  input.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    try {
      if (file && typeof onFile === "function") await onFile(file);
    } finally {
      cleanup();
    }
  }, { once: true });

  // Falls der Nutzer den Kamera-Intent abbricht, bleibt ein unsichtbarer Input
  // harmlos zurück. Beim nächsten Aufruf wird bewusst wieder ein NEUER Input
  // mit capture="environment" erstellt, damit kein alter Browserzustand benutzt wird.
  input.click();
  return input;
}
