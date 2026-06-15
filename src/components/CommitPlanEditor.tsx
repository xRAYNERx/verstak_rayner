import type { CommitGroup } from '../types/api'

/**
 * CommitPlanEditor (Dev Task Flow, Фаза 4) — показывает группы коммитов из
 * commit-planner + редактируемое итоговое сообщение коммита.
 *
 * V1: без drag-n-drop. Список групп (type(scope) + subject + файлы) для обзора
 * разбивки, а ниже — textarea с commitMessage, которое уйдёт в devtask:commit.
 * Сообщение — единственное, что пользователь правит руками; группы информативны.
 */

interface CommitPlanEditorProps {
  groups: CommitGroup[]
  message: string
  onMessageChange: (msg: string) => void
}

export function CommitPlanEditor({ groups, message, onMessageChange }: CommitPlanEditorProps) {
  return (
    <div className="gg-commitplan">
      {groups.length > 0 && (
        <div className="gg-commitplan-groups">
          {groups.map((g, i) => (
            <div key={`${g.type}-${g.scope}-${i}`} className="gg-commitplan-group">
              <div className="gg-commitplan-group-head">
                <span className={`gg-commitplan-type is-${g.type}`}>{g.type}</span>
                <span className="gg-commitplan-scope">({g.scope})</span>
                <span className="gg-commitplan-subject">{g.subject}</span>
                <span className="gg-commitplan-count">{g.files.length}</span>
              </div>
              <div className="gg-commitplan-files">
                {g.files.map(f => (
                  <span key={f} className="gg-commitplan-file" title={f}>{f}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <label className="gg-commitplan-label">Сообщение коммита</label>
      <textarea
        className="gg-commitplan-message"
        value={message}
        onChange={e => onMessageChange(e.target.value)}
        rows={Math.min(10, Math.max(3, message.split('\n').length + 1))}
        spellCheck={false}
        placeholder="type(scope): subject"
      />
    </div>
  )
}
