import type { ActivityPublicDto } from './activity-definition.ts';
import {
  ActivityChoiceField,
  choicesForScopeReason,
  rotateChoices,
} from './activity-choice-field.tsx';
import {
  EvidenceMatchBoard,
  FlipRecordControl,
  LinkPathBoard,
} from './activity-specialized-controls.tsx';

export function ActivityControl({ activity, values, order, onValueChange, onOrderChange }: {
  activity: ActivityPublicDto;
  values: Record<string, string>;
  order: string[];
  onValueChange: (key: string, value: string) => void;
  onOrderChange: (value: string[]) => void;
}) {
  if (activity.kind === 'link-reconstruction') {
    return <LinkPathBoard activity={activity} onOrderChange={onOrderChange} order={order} />;
  }

  if (activity.kind === 'structured-record') {
    if (activity.id === 'P1T1-N02-transfer-01') {
      return <FlipRecordControl activity={activity} onValueChange={onValueChange} values={values} />;
    }
    return (
      <div className="activity-record-form" data-structured-record-form="true">
        {activity.interaction.fields.map((field) => (
          <ActivityChoiceField
            activityId={activity.id}
            compact={activity.interaction.fields.length > 1}
            field={field}
            key={field.id}
            onValueChange={(value) => onValueChange(field.id, value)}
            value={values[field.id] ?? ''}
          />
        ))}
      </div>
    );
  }

  if (activity.kind === 'four-state-judgement') {
    const { categories } = activity.interaction;
    return (
      <table className="activity-state-matrix" data-four-state-matrix="true">
        <thead>
          <tr>
            <th scope="col">证据条件</th>
            {categories.map((category) => <th key={category.id} scope="col">{category.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {activity.materials.map((material) => (
            <tr key={material.id}>
              <th scope="row"><strong>{material.label}</strong><small>{material.detail}</small></th>
              {categories.map((category) => (
                <td key={category.id}>
                  <input
                    aria-label={`${material.label}：${category.label}`}
                    checked={values[material.id] === category.id}
                    name={`${activity.id}-${material.id}`}
                    onChange={() => onValueChange(material.id, category.id)}
                    type="radio"
                    value={category.id}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (activity.kind === 'defective-sheet-revision') {
    const { fields } = activity.interaction;
    return (
      <table className="activity-revision-table" data-defective-sheet-revision="true">
        <thead>
          <tr>
            <th scope="col">缺陷项</th>
            <th scope="col">缺陷原值</th>
            <th scope="col">修订值</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field, index) => {
            const material = activity.materials[index];
            return (
              <tr key={field.id}>
                <th scope="row">{material?.label ?? field.label}</th>
                <td>{material?.sourceValue ?? material?.detail ?? '—'}</td>
                <td>
                  <ActivityChoiceField
                    activityId={activity.id}
                    compact
                    field={field}
                    onValueChange={(value) => onValueChange(field.id, value)}
                    value={values[field.id] ?? ''}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  if (activity.kind === 'evidence-classification' && activity.id === 'P1T1-N02-foundation-01') {
    return <EvidenceMatchBoard activity={activity} onValueChange={onValueChange} values={values} />;
  }

  return (
    <>
      <div className="activity-classification-board" data-classification-board={activity.kind}>
        {activity.materials.map((material) => (
          <fieldset key={material.id}>
            <legend><strong>{material.label}</strong><small>{material.detail}</small></legend>
            {activity.interaction.categories.map((category) => (
              <label key={category.id}>
                <input
                  checked={values[material.id] === category.id}
                  name={`${activity.id}-${material.id}`}
                  onChange={() => {
                    onValueChange(material.id, category.id);
                    if (activity.kind === 'scope-classification' && category.id !== 'out-of-scope') {
                      onValueChange(`reason:${material.id}`, '');
                    }
                  }}
                  type="radio"
                  value={category.id}
                />
                <span>{category.label}</span>
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      {activity.kind === 'scope-classification' ? (
        <section className="activity-scope-reason-board" data-scope-reason-board={activity.id}>
          <strong>排除理由</strong>
          <p>先完成范围分类。被排除的对象还要选择一条能回查到任务单、机房或运营商边界的依据。</p>
          {activity.materials.filter((material) => values[material.id] === 'out-of-scope').map((material) => (
            <fieldset data-scope-reason-field={material.id} key={material.id}>
              <legend>{material.label}：为什么排除？</legend>
              <div>
                {rotateChoices(choicesForScopeReason(material.id), `${activity.id}/${material.id}`).map((reason, index) => (
                  <button
                    aria-pressed={values[`reason:${material.id}`] === reason}
                    data-scope-reason-option={`${material.id}-${index + 1}`}
                    key={reason}
                    onClick={() => onValueChange(`reason:${material.id}`, reason)}
                    type="button"
                  >
                    <span>{String.fromCharCode(65 + index)}</span>
                    {reason}
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
          {!activity.materials.some((material) => values[material.id] === 'out-of-scope') ? (
            <small>选择“排除并说明”后，这里会出现对应的理由选项。</small>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
