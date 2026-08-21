/**
 * Soluciones de referencia para los optimizadores (LAB-1107).
 *
 * ## De dónde salen
 *
 * De `scipy.optimize.minimize` con SLSQP, que es el mismo camino que sigue el
 * cuaderno de estudio. El guion que las generó vive fuera del repositorio y
 * **Python no entra en el producto**: estas cifras están congeladas aquí y las
 * pruebas corren en TypeScript.
 *
 * ## Por qué merecen la pena
 *
 * Un optimizador propio comparado contra sí mismo solo demuestra que es
 * determinista. Comparar contra un solucionador maduro y con otro algoritmo
 * —programación cuadrática secuencial frente a gradiente proyectado— es lo que
 * distingue «converge» de «converge a la solución correcta».
 *
 * El caso `tres_incorrelados` se puede verificar además a mano: con covarianza
 * diagonal, la mínima varianza reparte proporcional a 1/varianza, o sea
 * 25 : 11,1 : 6,25, que normalizado da 0,590 / 0,262 / 0,148. Coincide.
 *
 * Regenerar: ver el guion en el informe de LAB-1107. Si cambia un algoritmo,
 * estas cifras **no se tocan**: o el cambio las respeta, o hay que justificar
 * por qué la referencia deja de valer.
 */

export interface ReferenciaCaso {
  readonly cov: readonly (readonly number[])[]
  readonly mu: readonly number[]
  readonly bounds: readonly (readonly number[])[]
  readonly riskFreeRate: number
  readonly minimumVariance: { readonly weights: readonly number[]; readonly volatility: number }
  readonly maximumSharpe: { readonly weights: readonly number[]; readonly sharpe: number }
  readonly maximumDiversification: {
    readonly weights: readonly number[]
    readonly diversificationRatio: number
  }
  readonly equalRiskContribution: { readonly weights: readonly number[] }
  readonly frontier: readonly {
    readonly target: number
    readonly weights: readonly number[]
    readonly volatility: number
    readonly expectedReturn: number
  }[]
  readonly returnRange: { readonly min: number; readonly max: number }
}

export const REFERENCIA_SCIPY: Readonly<Record<string, ReferenciaCaso>> = {
  "tres_incorrelados": {
    "cov": [
      [
        0.04,
        0,
        0
      ],
      [
        0,
        0.09,
        0
      ],
      [
        0,
        0,
        0.16
      ]
    ],
    "mu": [
      0.05,
      0.07,
      0.11
    ],
    "bounds": [
      [
        0,
        1
      ],
      [
        0,
        1
      ],
      [
        0,
        1
      ]
    ],
    "riskFreeRate": 0.02,
    "minimumVariance": {
      "weights": [
        0.5901639516853944,
        0.26229507890047615,
        0.14754096941412956
      ],
      "volatility": 0.15364425591947534
    },
    "maximumSharpe": {
      "weights": [
        0.4014869926621164,
        0.2973977670980469,
        0.3011152402398367
      ],
      "sharpe": 0.3176519758757653
    },
    "maximumDiversification": {
      "weights": [
        0.46153847516299584,
        0.30769229852697777,
        0.23076922631002647
      ],
      "diversificationRatio": 1.7320508075688767
    },
    "equalRiskContribution": {
      "weights": [
        0.46153846531944465,
        0.3076923064379719,
        0.2307692282425835
      ]
    },
    "frontier": [
      {
        "target": 0.07557376980714296,
        "weights": [
          0.37182650074814044,
          0.30291600369941024,
          0.3252574955524493
        ],
        "volatility": 0.175257574698449,
        "expectedReturn": 0.07557376980713518
      },
      {
        "target": 0.08704917987142863,
        "weights": [
          0.15348906034463627,
          0.34353691269732606,
          0.5029740269580377
        ],
        "volatility": 0.22812540430128705,
        "expectedReturn": 0.0870491798714288
      },
      {
        "target": 0.09852458993571431,
        "weights": [
          2.698040976142975e-18,
          0.2868852516071421,
          0.7131147483928578
        ],
        "volatility": 0.2979471536751741,
        "expectedReturn": 0.09852458993571431
      }
    ],
    "returnRange": {
      "min": 0.0640983597428573,
      "max": 0.10999999999999997
    }
  },
  "tres_correlados": {
    "cov": [
      [
        0.04,
        0.01,
        0
      ],
      [
        0.01,
        0.09,
        0.005
      ],
      [
        0,
        0.005,
        0.16
      ]
    ],
    "mu": [
      0.04,
      0.07,
      0.11
    ],
    "bounds": [
      [
        0,
        1
      ],
      [
        0,
        1
      ],
      [
        0,
        1
      ]
    ],
    "riskFreeRate": 0.02,
    "minimumVariance": {
      "weights": [
        0.6173285243648267,
        0.22141997495868637,
        0.16125150067648708
      ],
      "volatility": 0.16403457121457643
    },
    "maximumSharpe": {
      "weights": [
        0.2690355310174861,
        0.3426396153460605,
        0.38832485363645336
      ],
      "sharpe": 0.28460813219014924
    },
    "maximumDiversification": {
      "weights": [
        0.45695364708191105,
        0.2876064310435224,
        0.2554399218745666
      ],
      "diversificationRatio": 1.6265903185500385
    },
    "equalRiskContribution": {
      "weights": [
        0.45845115971219313,
        0.29897008471116737,
        0.24257875557663952
      ]
    },
    "frontier": [
      {
        "target": 0.07094765322208602,
        "weights": [
          0.38519918931659874,
          0.30221008814380174,
          0.3125907225395996
        ],
        "volatility": 0.18182930696103666,
        "expectedReturn": 0.07094765322208603
      },
      {
        "target": 0.08396510214805734,
        "weights": [
          0.1530698618010659,
          0.3830001881466768,
          0.4639299500522573
        ],
        "volatility": 0.22699243675140848,
        "expectedReturn": 0.08396510214805832
      },
      {
        "target": 0.09698255107402867,
        "weights": [
          2.1986485341981487e-17,
          0.32543622314928367,
          0.6745637768507164
        ],
        "volatility": 0.2907453650615311,
        "expectedReturn": 0.09698255107402867
      }
    ],
    "returnRange": {
      "min": 0.057930204296114694,
      "max": 0.10999999999999999
    }
  },
  "cuatro_con_topes": {
    "cov": [
      [
        0.02,
        0.008,
        0.001,
        0
      ],
      [
        0.008,
        0.05,
        0.004,
        0.001
      ],
      [
        0.001,
        0.004,
        0.09,
        0.01
      ],
      [
        0,
        0.001,
        0.01,
        0.25
      ]
    ],
    "mu": [
      0.03,
      0.06,
      0.08,
      0.12
    ],
    "bounds": [
      [
        0,
        0.5
      ],
      [
        0,
        0.5
      ],
      [
        0,
        0.3
      ],
      [
        0,
        0.15
      ]
    ],
    "riskFreeRate": 0.02,
    "minimumVariance": {
      "weights": [
        0.4999999999999999,
        0.2622208276615473,
        0.1743135608684681,
        0.06346561146998467
      ],
      "volatility": 0.12276774965239637
    },
    "maximumSharpe": {
      "weights": [
        0.1742150996569479,
        0.3757849003430523,
        0.3,
        0.14999999999999997
      ],
      "sharpe": 0.31825559857143476
    },
    "maximumDiversification": {
      "weights": [
        0.40915729461691885,
        0.2413264602759878,
        0.21295805919477698,
        0.13655818591231636
      ],
      "diversificationRatio": 1.8279506902293385
    },
    "equalRiskContribution": {
      "weights": [
        0.41284062682347916,
        0.2550234190645715,
        0.20497365925110916,
        0.12716229486084032
      ]
    },
    "frontier": [
      {
        "target": 0.05759565592917633,
        "weights": [
          0.43339226303191375,
          0.252348804420183,
          0.20645280331851168,
          0.1078061292293917
        ],
        "volatility": 0.12855854775413292,
        "expectedReturn": 0.05759565592917633
      },
      {
        "target": 0.06289710395278422,
        "weights": [
          0.33373283859099,
          0.29151108513418134,
          0.2394068866493896,
          0.13534918962543904
        ],
        "volatility": 0.13862334939315246,
        "expectedReturn": 0.06289710395278444
      },
      {
        "target": 0.06819855197639212,
        "weights": [
          0.2178892296861976,
          0.3453493269649007,
          0.28676144334890175,
          0.15
        ],
        "volatility": 0.15173594312576805,
        "expectedReturn": 0.0681985519763921
      }
    ],
    "returnRange": {
      "min": 0.052294207905568435,
      "max": 0.07350000000000001
    }
  }
}
