import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { extractProfileFields } from "../src/profile-engine.js";
import { compareExtractions } from "../src/comparison.js";

const config=JSON.parse(fs.readFileSync(new URL("../public/config/label-profiles.json",import.meta.url),"utf8"));
const product=config.profiles.find(p=>p.role==="product");
const vda=config.profiles.find(p=>p.role==="vda");
const item=(text,score,poly)=>({text,score,poly});
const productItems=[
 item("TEROSON",.997,[[298,76],[861,68],[862,180],[299,187]]),
 item("2210485",.999,[[955,277],[1158,271],[1160,321],[956,328]]),
 item("25 KG",.948,[[1004,333],[1157,329],[1159,380],[1005,384]]),
 item("D562900431",.999,[[858,404],[1042,400],[1043,434],[858,437]])
];
const vdaItems=[
 item("Mercedes-Benz AG",.968,[[230,128],[522,128],[522,160],[230,160]]),
 item("12981531",.999,[[580,254],[783,252],[784,297],[581,299]]),
 item("1300 KG",.93,[[569,517],[803,517],[803,568],[569,568]]),
 item("1845762",.999,[[822,597],[971,597],[971,634],[822,634]]),
 item("D561707374",.999,[[1172,847],[1407,844],[1407,884],[1173,888]])
];

test("getestete Produkt- und Mercedesfelder werden korrekt zugeordnet",()=>{
 const p=extractProfileFields(productItems,product,{width:1800,height:1013});
 const v=extractProfileFields(vdaItems,vda,{width:1800,height:1013});
 assert.equal(p.fields.batch.value,"D562900431");
 assert.equal(p.fields.idh.value,"2210485");
 assert.equal(p.fields.weight.value,"25 KG");
 assert.equal(v.fields.delivery_note.value,"12981531");
 assert.equal(v.fields.idh.value,"1845762");
 assert.equal(v.fields.weight.value,"1300 KG");
 assert.equal(v.fields.batch.value,"D561707374");
 const comparison=compareExtractions(p,v);
 assert.equal(comparison.status,"rejected");
});
