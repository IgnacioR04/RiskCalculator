/**
 * Las dos mitades del Laboratorio (LAB-109).
 *
 * Presenta qué pregunta responde cada área para que el usuario elija con
 * criterio, en vez de descubrirlo pulsando. No muestra ninguna métrica: es
 * orientación, no diagnóstico.
 */
import { Link } from 'react-router-dom'
import { labPath, type LabRouteId } from '../routes/labRoutes'

interface Mundo {
  readonly id: LabRouteId
  readonly titulo: string
  readonly pregunta: string
  readonly descripcion: string
}

const MUNDOS: readonly Mundo[] = [
  {
    id: 'lab.stability',
    titulo: 'Estabilidad',
    pregunta: '¿Qué tengo y qué puede hacerme daño?',
    descripcion:
      'Presente y pasado: dónde estás expuesto, cuánto dependes de cada posición y cómo se ha comportado la cartera.',
  },
  {
    id: 'lab.future',
    titulo: 'Escenarios y oportunidades',
    pregunta: '¿Qué decisiones merece la pena estudiar?',
    descripcion:
      'Futuros posibles: qué pasaría bajo distintos supuestos y qué alternativas comparar. No son predicciones.',
  },
]

export function TwoWorldsCard() {
  return (
    <div className="lab-mundos">
      {MUNDOS.map((mundo) => (
        <Link key={mundo.id} to={labPath(mundo.id)} className="lab-mundo card">
          <h2>{mundo.titulo}</h2>
          <p className="lab-mundo__pregunta">{mundo.pregunta}</p>
          <p className="muted">{mundo.descripcion}</p>
        </Link>
      ))}
    </div>
  )
}
