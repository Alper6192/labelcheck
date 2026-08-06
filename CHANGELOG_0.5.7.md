# Änderungen 0.5.7

- Automatische Extraktionstests verwenden jetzt eine feste Test-Fixture statt der produktiven `public/config/label-profiles.json`.
- Eigene, im Profileditor exportierte Profile dürfen Produktnamen, Reihenfolge, Koordinaten und Feldzonen ändern, ohne die TEROSON-Testfälle zu zerstören.
- Die produktive Profildatei wird weiterhin auf gültiges JSON, eindeutige Profil-IDs, bekannte Feldtypen und gültige reguläre Ausdrücke geprüft.
- Der Patch enthält keine produktive `label-profiles.json` und überschreibt daher keine Benutzerprofile.
