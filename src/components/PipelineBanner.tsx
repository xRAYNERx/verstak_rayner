import { useProject } from '../store/projectStore'
import { useT } from '../i18n'
import { pipelineStepIndex } from '../lib/pipeline-brief'
import type { PipelineStep } from '../types/api'

interface PipelineBannerProps {
  /** Действие первичной кнопки шага (advance + оркестрация send) — вяжется в D5. */
  onPrimary: (step: PipelineStep) => void
}

/**
 * Sticky-баннер Pipeline (спек §3): «Pipeline · N/5 · {шаг}» + кнопка перехода
 * + отмена. Рендерится только когда есть activePipeline в НЕтерминальном шаге.
 * Реальная оркестрация перехода (send Plan/Execute) — D5 через onPrimary.
 */
export function PipelineBanner({ onPrimary }: PipelineBannerProps) {
  const t = useT()
  const pipeline = useProject(s => s.activePipeline)
  const cancelPipeline = useProject(s => s.cancelPipeline)

  if (!pipeline) return null
  const step = pipeline.step
  if (step === 'completed' || step === 'cancelled') return null

  const { index, total } = pipelineStepIndex(step)
  const stepLabel: Record<string, string> = {
    plan: t.pipeline.stepPlan,
    execute: t.pipeline.stepExecute,
    verify: t.pipeline.stepVerify,
    proof: t.pipeline.stepProof,
  }
  const primaryLabel: Partial<Record<PipelineStep, string>> = {
    plan: t.pipeline.planOk,
    execute: t.pipeline.toVerify,
    verify: t.pipeline.toProof,
    proof: t.pipeline.toProof,
  }

  return (
    <div className="gg-pipeline-banner" role="status">
      <span className="gg-pipeline-banner-tag">{t.pipeline.banner}</span>
      <span className="gg-pipeline-banner-step">{index}/{total} · {stepLabel[step] ?? step}</span>
      <span className="gg-pipeline-banner-goal" title={pipeline.brief.goal}>{pipeline.brief.goal}</span>
      <span className="gg-pipeline-banner-spacer" />
      {primaryLabel[step] && (
        <button type="button" className="gg-btn gg-btn-primary gg-btn-xs" onClick={() => onPrimary(step)}>
          {primaryLabel[step]}
        </button>
      )}
      <button type="button" className="gg-btn gg-btn-ghost gg-btn-xs" onClick={() => void cancelPipeline()}>
        {t.pipeline.cancelRun}
      </button>
    </div>
  )
}
