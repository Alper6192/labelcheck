import * as XLSX from "xlsx";
export function exportRecords(records){
  const rows=(records||[]).map((r,i)=>({
    Nr:i+1,Zeitstempel:r.timestamp,Ergebnis:r.result,
    Batch_Produkt:safe(r.product.batch),Fassnummer_Produkt:safe(r.product.drum_number),Batch_VDA:safe(r.vda.batch),
    IDH_Produkt:safe(r.product.idh),IDH_VDA:safe(r.vda.idh),
    Gewicht_Produkt:safe(r.product.weight),Gewicht_VDA:safe(r.vda.weight),
    Lieferscheinnummer:safe(r.vda.delivery_note),Produktprofil:safe(r.productProfile),VDA_Profil:safe(r.vdaProfile),Manuell_korrigiert:r.manual?"Ja":"Nein"
  }));
  const ws=XLSX.utils.json_to_sheet(rows); ws["!cols"]=[{wch:6},{wch:24},{wch:20},...Array(11).fill({wch:20})];
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"Etikettenprüfungen");
  XLSX.writeFile(wb,`Etikettenpruefungen_${new Date().toISOString().slice(0,10)}.xlsx`);
}
function safe(v){const s=String(v??"");return /^[=+\-@]/.test(s)?`'${s}`:s;}
