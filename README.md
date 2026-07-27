{
  "schema": "labelcheck-config",
  "schemaVersion": 4,
  "configVersion": "4.0.0",
  "description": "Neu aufgebaute Konfiguration aus den 60 bereitgestellten Original- und Referenzfotos.",
  "formats": {
    "Format_001": {
      "formatId": "Format_001",
      "formatName": "Produktlabel",
      "labelRole": "product",
      "active": true,
      "templateImage": "assets/templates/Format_001.jpg",
      "normalizedSize": {
        "width": 1200,
        "height": 867
      },
      "recognitionAnchors": [
        "TEROSON",
        "POLYURETHANE",
        "HENKEL",
        "BATCH NO"
      ],
      "recognition": {
        "maxFeatures": 1600,
        "fieldExclusionPadding": 0.012
      },
      "fields": [
        {
          "id": "Format_001_idh",
          "semantic": "idh",
          "name": "IDH",
          "x": 0.533333,
          "y": 0.224913,
          "width": 0.195833,
          "height": 0.074971,
          "required": true,
          "ocrMode": "word",
          "padding": 0.01,
          "regex": "^[0-9]{7}$",
          "digitLengths": [
            7
          ]
        },
        {
          "id": "Format_001_weight",
          "semantic": "weight",
          "name": "Gewicht / Menge",
          "x": 0.575,
          "y": 0.294118,
          "width": 0.1625,
          "height": 0.074971,
          "required": true,
          "ocrMode": "line",
          "padding": 0.015,
          "regex": "^[0-9]+(?:[.,][0-9]+)?(?:\\s*(?:KG|KGM|LTR|L|G))?$",
          "selection": "first"
        },
        {
          "id": "Format_001_batch_and_drum",
          "semantic": "batch_and_drum",
          "name": "Batch + Fass",
          "x": 0.454167,
          "y": 0.369089,
          "width": 0.291667,
          "height": 0.063437,
          "required": true,
          "ocrMode": "line",
          "padding": 0.01,
          "regex": "^D[0-9]{9}\\s*/\\s*[0-9]{1,6}$",
          "batchDigits": 9,
          "drumDigits": [
            1,
            6
          ],
          "prependD": true
        }
      ],
      "codeRegions": []
    },
    "Format_002": {
      "formatId": "Format_002",
      "formatName": "BMW",
      "labelRole": "comparison",
      "active": true,
      "templateImage": "assets/templates/Format_002.jpg",
      "normalizedSize": {
        "width": 1200,
        "height": 857
      },
      "recognitionAnchors": [
        "BMW",
        "BAYERISCHE MOTORENWERKE",
        "HENKEL AG",
        "REGENSBURG"
      ],
      "recognition": {
        "maxFeatures": 1600,
        "fieldExclusionPadding": 0.012
      },
      "fields": [
        {
          "id": "Format_002_delivery_note",
          "semantic": "delivery_note",
          "name": "Lieferscheinnummer",
          "x": 0.129167,
          "y": 0.169195,
          "width": 0.258333,
          "height": 0.093349,
          "required": false,
          "ocrMode": "line",
          "padding": 0.01,
          "regex": "^[0-9]{8}$",
          "digitLengths": [
            8
          ],
          "preserveLeadingZeros": true
        },
        {
          "id": "Format_002_weight",
          "semantic": "weight",
          "name": "Gewicht / Menge",
          "x": 0.225,
          "y": 0.478413,
          "width": 0.258333,
          "height": 0.093349,
          "required": false,
          "ocrMode": "line",
          "padding": 0.015,
          "regex": "^[0-9]+(?:[.,][0-9]+)?(?:\\s*(?:KG|KGM|LTR|L|G))?$",
          "selection": "first"
        },
        {
          "id": "Format_002_idh",
          "semantic": "idh",
          "name": "IDH",
          "x": 0.4875,
          "y": 0.600933,
          "width": 0.191667,
          "height": 0.08168,
          "required": false,
          "ocrMode": "word",
          "padding": 0.01,
          "regex": "^[0-9]{7}$",
          "digitLengths": [
            7
          ]
        },
        {
          "id": "Format_002_batch",
          "semantic": "batch",
          "name": "Batch",
          "x": 0.620833,
          "y": 0.84014,
          "width": 0.275,
          "height": 0.105018,
          "required": true,
          "ocrMode": "line",
          "padding": 0.01,
          "regex": "^D[0-9]{9}$",
          "digitLengths": [
            9
          ],
          "prependD": true
        }
      ],
      "codeRegions": []
    },
    "Format_003": {
      "formatId": "Format_003",
      "formatName": "Dachser",
      "labelRole": "comparison",
      "active": true,
      "templateImage": "assets/templates/Format_003.jpg",
      "normalizedSize": {
        "width": 864,
        "height": 1200
      },
      "recognitionAnchors": [
        "IGS AEROSOLS",
        "SSCC",
        "HENKEL TEROSON",
        "GERMANY"
      ],
      "recognition": {
        "maxFeatures": 1600,
        "fieldExclusionPadding": 0.012
      },
      "fields": [
        {
          "id": "Format_003_idh",
          "semantic": "idh",
          "name": "IDH",
          "x": 0.237269,
          "y": 0.229167,
          "width": 0.248843,
          "height": 0.054167,
          "required": false,
          "ocrMode": "word",
          "padding": 0.01,
          "regex": "^[0-9]{7}$",
          "digitLengths": [
            7
          ]
        },
        {
          "id": "Format_003_batch",
          "semantic": "batch",
          "name": "Batch",
          "x": 0.237269,
          "y": 0.291667,
          "width": 0.277778,
          "height": 0.054167,
          "required": true,
          "ocrMode": "line",
          "padding": 0.01,
          "regex": "^D[0-9]{9}$",
          "digitLengths": [
            9
          ],
          "prependD": true
        },
        {
          "id": "Format_003_delivery_note",
          "semantic": "delivery_note",
          "name": "Lieferscheinnummer",
          "x": 0.717593,
          "y": 0.258333,
          "width": 0.21412,
          "height": 0.054167,
          "required": false,
          "ocrMode": "line",
          "padding": 0.01,
          "regex": "^[0-9]{8}$",
          "digitLengths": [
            8
          ],
          "preserveLeadingZeros": true
        },
        {
          "id": "Format_003_weight",
          "semantic": "weight",
          "name": "Gewicht / Menge",
          "x": 0.717593,
          "y": 0.320833,
          "width": 0.092593,
          "height": 0.05,
          "required": false,
          "ocrMode": "line",
          "padding": 0.015,
          "regex": "^[0-9]+(?:[.,][0-9]+)?(?:\\s*(?:KG|KGM|LTR|L|G))?$",
          "selection": "first"
        }
      ],
      "codeRegions": []
    },
    "Format_004": {
      "formatId": "Format_004",
      "formatName": "Intern1",
      "labelRole": "comparison",
      "active": true,
      "templateImage": "assets/templates/Format_004.jpg",
      "normalizedSize": {
        "width": 1200,
        "height": 847
      },
      "recognitionAnchors": [
        "TEROSON RB 3208",
        "MATERIAL",
        "CHARGE",
        "REFERENZBELEG"
      ],
      "recognition": {
        "maxFeatures": 1600,
        "fieldExclusionPadding": 0.012
      },
      "fields": [
        {
          "id": "Format_004_idh",
          "semantic": "idh",
          "name": "IDH",
          "x": 0.008333,
          "y": 0.123967,
          "width": 0.15,
          "height": 0.070838,
          "required": false,
          "ocrMode": "word",
          "padding": 0.01,
          "regex": "^[0-9]{7}$",
          "digitLengths": [
            7
          ]
        },
        {
          "id": "Format_004_batch",
          "semantic": "batch",
          "name": "Batch",
          "x": 0.333333,
          "y": 0.123967,
          "width": 0.208333,
          "height": 0.070838,
          "required": true,
          "ocrMode": "line",
          "padding": 0.01,
          "regex": "^D[0-9]{9}$",
          "digitLengths": [
            9
          ],
          "prependD": true
        },
        {
          "id": "Format_004_weight",
          "semantic": "weight",
          "name": "Gewicht / Menge",
          "x": 0.641667,
          "y": 0.123967,
          "width": 0.233333,
          "height": 0.070838,
          "required": false,
          "ocrMode": "line",
          "padding": 0.015,
          "regex": "^[0-9]+(?:[.,][0-9]+)?(?:\\s*(?:KG|KGM|LTR|L|G))?$",
          "selection": "first"
        },
        {
          "id": "Format_004_delivery_note",
          "semantic": "delivery_note",
          "name": "Lieferscheinnummer",
          "x": 0.641667,
          "y": 0.460449,
          "width": 0.208333,
          "height": 0.076741,
          "required": false,
          "ocrMode": "line",
          "padding": 0.01,
          "regex": "^[0-9]{10}$",
          "digitLengths": [
            10
          ],
          "preserveLeadingZeros": true
        }
      ],
      "codeRegions": []
    },
    "Format_005": {
      "formatId": "Format_005",
      "formatName": "Intern2",
      "labelRole": "comparison",
      "active": true,
      "templateImage": "assets/templates/Format_005.jpg",
      "normalizedSize": {
        "width": 1200,
        "height": 848
      },
      "recognitionAnchors": [
        "ADDOCAT PP",
        "VENDOR BATCH",
        "INSPECTION LOT",
        "REFERENCE DOCUMENT"
      ],
      "recognition": {
        "maxFeatures": 1600,
        "fieldExclusionPadding": 0.012
      },
      "fields": [
        {
          "id": "Format_005_idh",
          "semantic": "idh",
          "name": "IDH",
          "x": 0.0125,
          "y": 0.135613,
          "width": 0.1375,
          "height": 0.070755,
          "required": false,
          "ocrMode": "word",
          "padding": 0.01,
          "regex": "^[0-9]{5}$",
          "digitLengths": [
            5
          ]
        },
        {
          "id": "Format_005_batch",
          "semantic": "batch",
          "name": "Batch",
          "x": 0.333333,
          "y": 0.135613,
          "width": 0.2,
          "height": 0.070755,
          "required": true,
          "ocrMode": "line",
          "padding": 0.01,
          "regex": "^D[0-9]{7}$",
          "digitLengths": [
            7
          ],
          "prependD": true
        },
        {
          "id": "Format_005_weight",
          "semantic": "weight",
          "name": "Gewicht / Menge",
          "x": 0.0125,
          "y": 0.347877,
          "width": 0.3125,
          "height": 0.082547,
          "required": false,
          "ocrMode": "line",
          "padding": 0.015,
          "regex": "^[0-9]+(?:[.,][0-9]+)?(?:\\s*(?:KG|KGM|LTR|L|G))?$",
          "selection": "first"
        },
        {
          "id": "Format_005_delivery_note",
          "semantic": "delivery_note",
          "name": "Lieferscheinnummer",
          "x": 0.6375,
          "y": 0.536557,
          "width": 0.208333,
          "height": 0.082547,
          "required": false,
          "ocrMode": "line",
          "padding": 0.01,
          "regex": "^[0-9]{10}$",
          "digitLengths": [
            10
          ],
          "preserveLeadingZeros": true
        }
      ],
      "codeRegions": [
        {
          "id": "Format_005_datamatrix",
          "name": "Datamatrix",
          "type": "data_matrix",
          "purpose": "data",
          "x": 0.658333,
          "y": 0.141509,
          "width": 0.141667,
          "height": 0.200472,
          "parser": {
            "mode": "generic"
          }
        }
      ]
    },
    "Format_006": {
      "formatId": "Format_006",
      "formatName": "Jaguar",
      "labelRole": "comparison",
      "active": true,
      "templateImage": "assets/templates/Format_006.jpg",
      "normalizedSize": {
        "width": 1200,
        "height": 834
      },
      "recognitionAnchors": [
        "JAGUAR LAND ROVER",
        "GREEN 7",
        "LOT",
        "DELIVERY"
      ],
      "recognition": {
        "maxFeatures": 1600,
        "fieldExclusionPadding": 0.012
      },
      "fields": [
        {
          "id": "Format_006_weight",
          "semantic": "weight",
          "name": "Gewicht / Menge",
          "x": 0.1375,
          "y": 0.125899,
          "width": 0.158333,
          "height": 0.077938,
          "required": false,
          "ocrMode": "line",
          "padding": 0.015,
          "regex": "^[0-9]+(?:[.,][0-9]+)?(?:\\s*(?:KG|KGM|LTR|L|G))?$",
          "selection": "first"
        },
        {
          "id": "Format_006_delivery_note",
          "semantic": "delivery_note",
          "name": "Lieferscheinnummer",
          "x": 0.479167,
          "y": 0.28777,
          "width": 0.225,
          "height": 0.101918,
          "required": false,
          "ocrMode": "line",
          "padding": 0.01,
          "regex": "^[0-9]{8}$",
          "digitLengths": [
            8
          ],
          "preserveLeadingZeros": true
        },
        {
          "id": "Format_006_idh",
          "semantic": "idh",
          "name": "IDH",
          "x": 0.675,
          "y": 0.281775,
          "width": 0.2125,
          "height": 0.107914,
          "required": false,
          "ocrMode": "word",
          "padding": 0.01,
          "regex": "^[0-9]{7}$",
          "digitLengths": [
            7
          ]
        },
        {
          "id": "Format_006_batch",
          "semantic": "batch",
          "name": "Batch",
          "x": 0.708333,
          "y": 0.347722,
          "width": 0.2875,
          "height": 0.113909,
          "required": true,
          "ocrMode": "line",
          "padding": 0.01,
          "regex": "^D[0-9]{9}$",
          "digitLengths": [
            9
          ],
          "prependD": true
        }
      ],
      "codeRegions": []
    },
    "Format_007": {
      "formatId": "Format_007",
      "formatName": "Mercedes",
      "labelRole": "comparison",
      "active": true,
      "templateImage": "assets/templates/Format_007.jpg",
      "normalizedSize": {
        "width": 1200,
        "height": 826
      },
      "recognitionAnchors": [
        "MERCEDES-BENZ",
        "HENKEL AG",
        "FÜLLMENGE",
        "CHARGEN-NR"
      ],
      "recognition": {
        "maxFeatures": 1600,
        "fieldExclusionPadding": 0.012
      },
      "fields": [
        {
          "id": "Format_007_delivery_note",
          "semantic": "delivery_note",
          "name": "Lieferscheinnummer",
          "x": 0.2875,
          "y": 0.187651,
          "width": 0.2125,
          "height": 0.090799,
          "required": false,
          "ocrMode": "line",
          "padding": 0.01,
          "regex": "^[0-9]{8}$",
          "digitLengths": [
            8
          ],
          "preserveLeadingZeros": true
        },
        {
          "id": "Format_007_weight",
          "semantic": "weight",
          "name": "Gewicht / Menge",
          "x": 0.279167,
          "y": 0.490315,
          "width": 0.2375,
          "height": 0.102906,
          "required": false,
          "ocrMode": "line",
          "padding": 0.015,
          "regex": "^[0-9]+(?:[.,][0-9]+)?(?:\\s*(?:KG|KGM|LTR|L|G))?$",
          "selection": "first"
        },
        {
          "id": "Format_007_idh",
          "semantic": "idh",
          "name": "IDH",
          "x": 0.491667,
          "y": 0.575061,
          "width": 0.216667,
          "height": 0.102906,
          "required": false,
          "ocrMode": "word",
          "padding": 0.01,
          "regex": "^[0-9]{7}$",
          "digitLengths": [
            7
          ]
        },
        {
          "id": "Format_007_batch",
          "semantic": "batch",
          "name": "Batch",
          "x": 0.741667,
          "y": 0.847458,
          "width": 0.258333,
          "height": 0.121065,
          "required": true,
          "ocrMode": "line",
          "padding": 0.01,
          "regex": "^D[0-9]{9}$",
          "digitLengths": [
            9
          ],
          "prependD": true
        }
      ],
      "codeRegions": []
    },
    "Format_008": {
      "formatId": "Format_008",
      "formatName": "Scania",
      "labelRole": "comparison",
      "active": true,
      "templateImage": "assets/templates/Format_008.jpg",
      "normalizedSize": {
        "width": 1200,
        "height": 858
      },
      "recognitionAnchors": [
        "SCANIA AB",
        "OSKARSHAMN",
        "MASTER LABEL",
        "ADVICE NOTE"
      ],
      "recognition": {
        "maxFeatures": 1600,
        "fieldExclusionPadding": 0.012
      },
      "fields": [
        {
          "id": "Format_008_delivery_note",
          "semantic": "delivery_note",
          "name": "Lieferscheinnummer",
          "x": 0.054167,
          "y": 0.285548,
          "width": 0.2375,
          "height": 0.110723,
          "required": false,
          "ocrMode": "line",
          "padding": 0.01,
          "regex": "^[0-9]{8}$",
          "digitLengths": [
            8
          ],
          "preserveLeadingZeros": true
        },
        {
          "id": "Format_008_idh",
          "semantic": "idh",
          "name": "IDH",
          "x": 0.045833,
          "y": 0.367133,
          "width": 0.325,
          "height": 0.13986,
          "required": false,
          "ocrMode": "word",
          "padding": 0.01,
          "regex": "^[0-9]{7}$",
          "digitLengths": [
            7
          ]
        },
        {
          "id": "Format_008_weight",
          "semantic": "weight",
          "name": "Gewicht / Menge",
          "x": 0.833333,
          "y": 0.477855,
          "width": 0.166667,
          "height": 0.134033,
          "required": false,
          "ocrMode": "line",
          "padding": 0.015,
          "regex": "^[0-9]+(?:[.,][0-9]+)?(?:\\s*(?:KG|KGM|LTR|L|G))?$",
          "selection": "last"
        },
        {
          "id": "Format_008_batch",
          "semantic": "batch",
          "name": "Batch",
          "x": 0.670833,
          "y": 0.623543,
          "width": 0.275,
          "height": 0.122378,
          "required": true,
          "ocrMode": "line",
          "padding": 0.01,
          "regex": "^D[0-9]{9}$",
          "digitLengths": [
            9
          ],
          "prependD": true
        }
      ],
      "codeRegions": [
        {
          "id": "Format_008_datamatrix",
          "name": "Datamatrix",
          "type": "data_matrix",
          "purpose": "data",
          "x": 0.775,
          "y": 0.017483,
          "width": 0.175,
          "height": 0.244755,
          "parser": {
            "mode": "generic"
          }
        }
      ]
    },
    "Format_009": {
      "formatId": "Format_009",
      "formatName": "Skoda",
      "labelRole": "comparison",
      "active": true,
      "templateImage": "assets/templates/Format_009.jpg",
      "normalizedSize": {
        "width": 1200,
        "height": 851
      },
      "recognitionAnchors": [
        "SKODA AUTO",
        "MLADA BOLESLAV",
        "URSPRUNGSLAND",
        "CHARGENNUMMER"
      ],
      "recognition": {
        "maxFeatures": 1600,
        "fieldExclusionPadding": 0.012
      },
      "fields": [
        {
          "id": "Format_009_idh",
          "semantic": "idh",
          "name": "IDH",
          "x": 0.054167,
          "y": 0.123384,
          "width": 0.170833,
          "height": 0.088132,
          "required": false,
          "ocrMode": "word",
          "padding": 0.01,
          "regex": "^[0-9]{6}$",
          "digitLengths": [
            6
          ]
        },
        {
          "id": "Format_009_delivery_note",
          "semantic": "delivery_note",
          "name": "Lieferscheinnummer",
          "x": 0.095833,
          "y": 0.282021,
          "width": 0.229167,
          "height": 0.111633,
          "required": false,
          "ocrMode": "line",
          "padding": 0.01,
          "regex": "^[0-9]{8}$",
          "digitLengths": [
            8
          ],
          "preserveLeadingZeros": true
        },
        {
          "id": "Format_009_weight",
          "semantic": "weight",
          "name": "Gewicht / Menge",
          "x": 0.729167,
          "y": 0.276146,
          "width": 0.158333,
          "height": 0.123384,
          "required": false,
          "ocrMode": "line",
          "padding": 0.015,
          "regex": "^[0-9]+(?:[.,][0-9]+)?(?:\\s*(?:KG|KGM|LTR|L|G))?$",
          "selection": "first"
        },
        {
          "id": "Format_009_batch",
          "semantic": "batch",
          "name": "Batch",
          "x": 0.6875,
          "y": 0.575793,
          "width": 0.25,
          "height": 0.141011,
          "required": true,
          "ocrMode": "line",
          "padding": 0.01,
          "regex": "^D[0-9]{9}$",
          "digitLengths": [
            9
          ],
          "prependD": true
        }
      ],
      "codeRegions": [
        {
          "id": "Format_009_datamatrix",
          "name": "Datamatrix",
          "type": "data_matrix",
          "purpose": "data",
          "x": 0.841667,
          "y": 0.017626,
          "width": 0.133333,
          "height": 0.199765,
          "parser": {
            "mode": "generic"
          }
        }
      ]
    },
    "Format_010": {
      "formatId": "Format_010",
      "formatName": "Stellantis",
      "labelRole": "comparison",
      "active": true,
      "templateImage": "assets/templates/Format_010.jpg",
      "normalizedSize": {
        "width": 1200,
        "height": 855
      },
      "recognitionAnchors": [
        "STELLANTIS EUROPE",
        "HENKEL ITALIA",
        "NUMERO LOTTO",
        "KGM"
      ],
      "recognition": {
        "maxFeatures": 1600,
        "fieldExclusionPadding": 0.012
      },
      "fields": [
        {
          "id": "Format_010_delivery_note",
          "semantic": "delivery_note",
          "name": "Lieferscheinnummer",
          "x": 0.195833,
          "y": 0.157895,
          "width": 0.316667,
          "height": 0.122807,
          "required": false,
          "ocrMode": "line",
          "padding": 0.01,
          "regex": "^[0-9]{10}$",
          "digitLengths": [
            10
          ],
          "preserveLeadingZeros": true
        },
        {
          "id": "Format_010_weight",
          "semantic": "weight",
          "name": "Gewicht / Menge",
          "x": 0.245833,
          "y": 0.45614,
          "width": 0.25,
          "height": 0.192982,
          "required": false,
          "ocrMode": "line",
          "padding": 0.015,
          "regex": "^[0-9]+(?:[.,][0-9]+)?(?:\\s*(?:KG|KGM|LTR|L|G))?$",
          "selection": "first"
        },
        {
          "id": "Format_010_idh",
          "semantic": "idh",
          "name": "IDH",
          "x": 0.479167,
          "y": 0.625731,
          "width": 0.191667,
          "height": 0.116959,
          "required": false,
          "ocrMode": "word",
          "padding": 0.01,
          "regex": "^[0-9]{7}$",
          "digitLengths": [
            7
          ]
        },
        {
          "id": "Format_010_batch",
          "semantic": "batch",
          "name": "Batch",
          "x": 0.775,
          "y": 0.614035,
          "width": 0.225,
          "height": 0.116959,
          "required": true,
          "ocrMode": "line",
          "padding": 0.01,
          "regex": "^D[0-9]{9}$",
          "digitLengths": [
            9
          ],
          "prependD": true
        }
      ],
      "codeRegions": [
        {
          "id": "Format_010_qr",
          "name": "Qr",
          "type": "qr",
          "purpose": "data",
          "x": 0.258333,
          "y": 0.660819,
          "width": 0.229167,
          "height": 0.339181,
          "parser": {
            "mode": "generic"
          }
        }
      ]
    },
    "Format_011": {
      "formatId": "Format_011",
      "formatName": "VW",
      "labelRole": "comparison",
      "active": true,
      "templateImage": "assets/templates/Format_011.jpg",
      "normalizedSize": {
        "width": 1200,
        "height": 846
      },
      "recognitionAnchors": [
        "VOLKSWAGEN AG",
        "BRAUNSCHWEIG",
        "DELIVERY NOTE",
        "BATCH NR"
      ],
      "recognition": {
        "maxFeatures": 1600,
        "fieldExclusionPadding": 0.012
      },
      "fields": [
        {
          "id": "Format_011_delivery_note",
          "semantic": "delivery_note",
          "name": "Lieferscheinnummer",
          "x": 0.041667,
          "y": 0.319149,
          "width": 0.233333,
          "height": 0.118203,
          "required": false,
          "ocrMode": "line",
          "padding": 0.01,
          "regex": "^[0-9]{8}$",
          "digitLengths": [
            8
          ],
          "preserveLeadingZeros": true
        },
        {
          "id": "Format_011_weight",
          "semantic": "weight",
          "name": "Gewicht / Menge",
          "x": 0.741667,
          "y": 0.319149,
          "width": 0.208333,
          "height": 0.118203,
          "required": false,
          "ocrMode": "line",
          "padding": 0.015,
          "regex": "^[0-9]+(?:[.,][0-9]+)?(?:\\s*(?:KG|KGM|LTR|L|G))?$",
          "selection": "first"
        },
        {
          "id": "Format_011_batch",
          "semantic": "batch",
          "name": "Batch",
          "x": 0.75,
          "y": 0.644208,
          "width": 0.2375,
          "height": 0.130024,
          "required": true,
          "ocrMode": "line",
          "padding": 0.01,
          "regex": "^D[0-9]{9}$",
          "digitLengths": [
            9
          ],
          "prependD": true
        },
        {
          "id": "Format_011_idh",
          "semantic": "idh",
          "name": "IDH",
          "x": 0.325,
          "y": 0.791962,
          "width": 0.333333,
          "height": 0.171395,
          "required": false,
          "ocrMode": "word",
          "padding": 0.01,
          "regex": "^[0-9]{7}$",
          "digitLengths": [
            7
          ]
        }
      ],
      "codeRegions": [
        {
          "id": "Format_011_datamatrix",
          "name": "Datamatrix",
          "type": "data_matrix",
          "purpose": "data",
          "x": 0.775,
          "y": 0.041371,
          "width": 0.141667,
          "height": 0.200946,
          "parser": {
            "mode": "generic"
          }
        }
      ]
    },
    "Format_012": {
      "formatId": "Format_012",
      "formatName": "Tesla",
      "labelRole": "comparison",
      "active": true,
      "templateImage": "assets/templates/Format_012.jpg",
      "normalizedSize": {
        "width": 1200,
        "height": 937
      },
      "recognitionAnchors": [
        "TESLA GIGAFACTORY",
        "LICENSE PLATE",
        "LOT CODE",
        "QUANTITY"
      ],
      "recognition": {
        "maxFeatures": 1600,
        "fieldExclusionPadding": 0.012
      },
      "fields": [
        {
          "id": "Format_012_weight",
          "semantic": "weight",
          "name": "Gewicht / Menge",
          "x": 0.0,
          "y": 0.416222,
          "width": 0.216667,
          "height": 0.117396,
          "required": false,
          "ocrMode": "line",
          "padding": 0.015,
          "regex": "^[0-9]+(?:[.,][0-9]+)?(?:\\s*(?:KG|KGM|LTR|L|G))?$",
          "selection": "first"
        },
        {
          "id": "Format_012_batch",
          "semantic": "batch",
          "name": "Batch",
          "x": 0.208333,
          "y": 0.747065,
          "width": 0.175,
          "height": 0.106724,
          "required": true,
          "ocrMode": "line",
          "padding": 0.01,
          "regex": "^D[0-9]{9}$",
          "digitLengths": [
            9
          ],
          "prependD": true
        }
      ],
      "codeRegions": [
        {
          "id": "Format_012_qr_small",
          "name": "Qr Small",
          "type": "qr",
          "purpose": "data",
          "x": 0.008333,
          "y": 0.672359,
          "width": 0.233333,
          "height": 0.282818,
          "parser": {
            "mode": "tokens",
            "separators": [
              ":",
              "\u001d",
              "\r",
              "\n"
            ],
            "outputs": [
              {
                "semantic": "batch",
                "pattern": "^(?:1T|H)?(D[0-9]{7,10})$",
                "group": 1
              },
              {
                "semantic": "delivery_note",
                "pattern": "^99Z([0-9]{7,10})$",
                "group": 1
              },
              {
                "key": "quantity",
                "pattern": "^Q([0-9]+(?:[.,][0-9]+)?)$",
                "group": 1
              },
              {
                "key": "unit",
                "pattern": "^3Q(KG|KGM|LTR|L|G)$",
                "group": 1
              }
            ],
            "combinations": [
              {
                "semantic": "weight",
                "parts": [
                  "quantity",
                  "unit"
                ],
                "separator": " "
              }
            ]
          }
        },
        {
          "id": "Format_012_qr_large",
          "name": "Großer QR-Code",
          "type": "qr",
          "purpose": "format_anchor",
          "x": 0.475,
          "y": 0.074707,
          "width": 0.475,
          "height": 0.693703
        }
      ]
    }
  },
  "settings": {
    "queryMaxSide": 1200,
    "templateAcceptance": {
      "minGoodMatches": 12,
      "minInliers": 9,
      "minInlierRatio": 0.34,
      "minCoverage": 0.06,
      "minScore": 42,
      "minMargin": 8
    },
    "ocr": {
      "safeConfidence": 72,
      "maxVariants": 3
    },
    "batchComparison": "exact"
  }
}