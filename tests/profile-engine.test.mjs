import test from "node:test";
import assert from "node:assert/strict";
import { parseFlorenceEntries } from "../src/ocr-entries.js";
import { resolveLabelProfile, mapWithProfile, solveHomography, applyHomography, homographyFromAnchor, transformRect } from "../src/profile-engine.js";
import { compareLabels } from "../src/comparison.js";

const quad = (x, y, w, h) => [x,y,x+w,y,x+w,y+h,x,y+h];

function sampleProfile() {
  return {
    id:"MERCEDES",name:"Mercedes",role:"vda",active:true,configured:true,manualOnly:false,
    anchor:{aliases:["MERCEDES-BENZ AG"],masterQuad:[0.05,0.05,0.35,0.05,0.35,0.13,0.05,0.13]},
    master:{width:1000,height:700,geometry:[]},
    fields:[
      {key:"idh",label:"IDH",rect:{x:.50,y:.60,width:.16,height:.06},pattern:"^[0-9]{6,8}$",extractor:"idh",required:true,compare:true},
      {key:"weight",label:"Gewicht",rect:{x:.29,y:.50,width:.12,height:.08},pattern:"^[0-9]+\\s*KG$",extractor:"weight",required:true,compare:true},
      {key:"batch",label:"Batch",rect:{x:.77,y:.87,width:.22,height:.08},pattern:"^D[0-9]{8,10}$",extractor:"batch",required:true,compare:true},
    ],
  };
}

test("berechnet eine Homographie aus der Kundenname-Textbox", () => {
  const source=[[0,0],[100,0],[100,30],[0,30]];
  const target=[[50,70],[250,70],[250,130],[50,130]];
  const h=solveHomography(source,target);
  const p=applyHomography(h,[50,15]);
  assert.ok(Math.abs(p[0]-150)<1e-6);
  assert.ok(Math.abs(p[1]-100)<1e-6);
});



test("ein einzelner Anker erzeugt keine kollabierende Projektivtransformation", () => {
  const profile = {
    master:{width:1000,height:966},
    anchor:{masterQuad:[.715,.795,.96,.795,.96,.92,.715,.92]},
  };
  const liveAnchor={box:quad(1090,1180,285,72)};
  const matrix=homographyFromAnchor(profile,liveAnchor,[1600,1500]);
  assert.ok(matrix);
  assert.equal(matrix[6],0);
  assert.equal(matrix[7],0);
  const fieldQuad=transformRect({x:.63,y:.376,width:.354,height:.054},profile.master,matrix);
  const xs=[fieldQuad[0],fieldQuad[2],fieldQuad[4],fieldQuad[6]];
  const ys=[fieldQuad[1],fieldQuad[3],fieldQuad[5],fieldQuad[7]];
  assert.ok(Math.max(...xs)-Math.min(...xs)>150);
  assert.ok(Math.max(...ys)-Math.min(...ys)>20);
  assert.ok(Math.min(...xs)>600);
  assert.ok(Math.min(...ys)<1000);
});

test("ordnet Werte ausschließlich über Kundenanker und Profilpositionen zu", () => {
  const profile=sampleProfile();
  const config={productProfileId:"",profiles:{MERCEDES:profile}};
  const labels=["MERCEDES-BENZ AG","12981531","1845762","1300 KG","D561707374"];
  const boxes=[
    quad(50,50,300,56),
    quad(100,170,110,34),
    quad(500,420,160,42),
    quad(290,350,120,52),
    quad(770,609,220,52),
  ];
  const entries=parseFlorenceEntries({"<OCR_WITH_REGION>":{labels,quad_boxes:boxes}},[1000,700]);
  const result=resolveLabelProfile(config,"vda",entries,[1000,700]);
  assert.equal(result.profile.id,"MERCEDES");
  assert.equal(result.fields.idh.value,"1845762");
  assert.equal(result.fields.weight.value,"1300 KG");
  assert.equal(result.fields.batch.value,"D561707374");
});

test("manuell gewähltes Profil wird ohne zweiten Florence-Lauf neu zugeordnet", () => {
  const profile=sampleProfile();
  const entries=parseFlorenceEntries({"<OCR_WITH_REGION>":{labels:["MERCEDES BENZ AG","1845762","900 KG","D562900548"],quad_boxes:[quad(50,50,300,56),quad(500,420,160,42),quad(290,350,120,52),quad(770,609,220,52)]}},[1000,700]);
  const result=mapWithProfile(profile,entries,[1000,700],{forced:true});
  assert.equal(result.fields.batch.value,"D562900548");
  assert.equal(result.fields.idh.value,"1845762");
});



test("wählt bei mehrfach vorhandenem HENKEL den geometrisch passenden Anker", () => {
  const profile = {
    id:"PRODUCT",name:"Produkt",role:"product",active:true,configured:true,manualOnly:false,
    anchor:{aliases:["HENKEL"],masterQuad:[.715,.795,.96,.795,.96,.92,.715,.92]},
    master:{width:1000,height:966,geometry:[]},
    fields:[
      {key:"idh",label:"IDH",rect:{x:.721,y:.247,width:.27,height:.055},pattern:"^[0-9]{6,8}$",extractor:"idh",required:true,compare:true},
      {key:"weight",label:"Gewicht",rect:{x:.778,y:.314,width:.209,height:.052},pattern:"^[0-9]+\\s*KG$",extractor:"weight",required:true,compare:true},
      {key:"batch",label:"Batch",rect:{x:.63,y:.377,width:.354,height:.053},pattern:"^D[0-9]{8,10}$",extractor:"batch",required:true,compare:true},
    ],
  };
  // Zwei HENKEL-Treffer: links in der Adresse und rechts das Logo.
  const labels=["HENKEL","HENKEL","2210485","25 KG","D562900431 /0001"];
  const boxes=[
    quad(145,560,80,22),
    quad(1110,620,210,80),
    quad(1050,185,180,38),
    quad(1110,245,135,36),
    quad(920,305,300,40),
  ];
  const entries=parseFlorenceEntries({"<OCR_WITH_REGION>":{labels,quad_boxes:boxes}},[1400,760]);
  const result=mapWithProfile(profile,entries,[1400,760],{forced:true});
  assert.ok(result.anchor.entry.centerX > 900);
  assert.equal(result.fields.idh.value,"2210485");
  assert.equal(result.fields.weight.value,"25 KG");
  assert.equal(result.fields.batch.value,"D562900431");
  assert.ok(result.refinement.fieldInliers >= 2);
});

test("Kundenname-Box darf bei anderer Zeilenbreite die Felder nicht zusammenziehen", () => {
  const profile=sampleProfile();
  // Masteranker ist breit und zweizeilig; live erkennt Florence nur die kurze erste Zeile.
  const labels=["MERCEDES-BENZ AG","12981531","1845762","1300 KG","D561707374"];
  const boxes=[
    quad(70,55,150,24),
    quad(180,185,145,34),
    quad(810,500,130,38),
    quad(470,405,150,48),
    quad(1220,700,210,48),
  ];
  const entries=parseFlorenceEntries({"<OCR_WITH_REGION>":{labels,quad_boxes:boxes}},[1500,820]);
  const result=mapWithProfile(profile,entries,[1500,820],{forced:true});
  assert.equal(result.fields.idh.value,"1845762");
  assert.equal(result.fields.weight.value,"1300 KG");
  assert.equal(result.fields.batch.value,"D561707374");
  const batchQuad=result.fields.batch.expectedQuad;
  assert.ok(Math.min(batchQuad[0],batchQuad[2],batchQuad[4],batchQuad[6]) > 900);
});

test("Vergleich gibt nur bei identischen Pflichtwerten frei", () => {
  const f=(value)=>({value});
  const product={batch:f("D123456789"),idh:f("2847365"),weight:f("200 KG")};
  const vda={batch:f("D123456789"),idh:f("2847365"),weight:f("200000 G")};
  assert.equal(compareLabels(product,vda).released,true);
  vda.batch=f("D999999999");
  assert.equal(compareLabels(product,vda).status,"rejected");
});
