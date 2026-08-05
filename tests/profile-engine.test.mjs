import test from "node:test";
import assert from "node:assert/strict";
import { parseFlorenceEntries } from "../src/ocr-entries.js";
import { resolveLabelProfile, mapWithProfile, solveHomography, applyHomography } from "../src/profile-engine.js";
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

test("Vergleich gibt nur bei identischen Pflichtwerten frei", () => {
  const f=(value)=>({value});
  const product={batch:f("D123456789"),idh:f("2847365"),weight:f("200 KG")};
  const vda={batch:f("D123456789"),idh:f("2847365"),weight:f("200000 G")};
  assert.equal(compareLabels(product,vda).released,true);
  vda.batch=f("D999999999");
  assert.equal(compareLabels(product,vda).status,"rejected");
});
