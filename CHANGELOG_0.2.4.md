# Version 0.2.4 – schnellere Arbeitsfolge

- Florence-2 wird direkt beim Öffnen der Scannerseite im Hintergrund geladen.
- Das Produktlabel wird unmittelbar nach seiner Aufnahme analysiert.
- Währenddessen kann bereits das VDA-Label aufgenommen werden.
- Das VDA-Label wird automatisch in eine sichere, serielle GPU-Warteschlange gestellt.
- Der bisher notwendige Klick auf „Beide Etiketten analysieren“ entfällt im Normalfall.
- Der Button bleibt als „Beide Etiketten erneut analysieren“ für Wiederholungen erhalten.
- Bildgröße wurde von maximal 1600 auf 1400 Pixel reduziert.
- Florence-Ausgabe wurde auf 256 Token für Produktlabels und 480 Token für VDA-Labels begrenzt.
- Veraltete Analyseergebnisse werden verworfen, wenn während einer laufenden Analyse ein Foto ersetzt wird.
- Service-Worker-Cache auf 0.2.4 angehoben.

Die zwei Florence-Inferenzen bleiben technisch notwendig. Die Verbesserung besteht vor allem darin, Modellstart und Produktanalyse mit der Bedienzeit zu überlappen.
