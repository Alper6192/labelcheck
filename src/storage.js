const KEY = "labelcheck-paddle-records-v1";
export function loadRecords(){try{return JSON.parse(localStorage.getItem(KEY)||"[]");}catch{return[];}}
export function saveRecord(record){const records=loadRecords();records.unshift(record);localStorage.setItem(KEY,JSON.stringify(records.slice(0,500)));return records;}
export function clearRecords(){localStorage.removeItem(KEY);return[];}
